'use strict';
/**
 * Runtime entry point for the DuoFern ioBroker adapter.
 *
 * Responsibilities:
 * - manage the ioBroker adapter lifecycle
 * - open and monitor the configured serial connection
 * - create and update device states
 * - process received telegrams
 * - queue and send control commands
 *
 * Protocol parsing and device profile data are kept in lib/protocol.js.
 */
const utils = require('@iobroker/adapter-core');
let SerialPort;
try {
    const serialportModule = require('serialport');
    SerialPort = serialportModule.SerialPort || serialportModule;
} catch (error) {
    SerialPort = null;
}


function normalizeSerialPath(value) {
    return String(value || '').trim().replace(/^\/{2,}dev\//, '/dev/');
}

const protocol = require('./lib/protocol');

// Obergrenze für wartende Statusabfragen. Bedienbefehle werden immer angenommen.
const MAX_QUEUE_LENGTH = 50;
// Standardintervall der zyklischen Statusabfrage (5 Minuten). DuoFern funkt auf 868 MHz mit 1 % Duty Cycle.
const DEFAULT_POLL_INTERVAL_MS = 300000;
// Readings, die bei aktivierter Positionsumkehr invertiert werden (ioBroker-Konvention level.blind: 100 = offen).
const INVERTIBLE_POSITION_READINGS = ['position', 'targetPosition'];

class Duofernstick extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'duofernstick' });

        this.serial = null;
        this.partial = '';
        this.flushTimer = null;
        this.reconnectTimer = null;
        this.pairTimer = null;
        this.unpairTimer = null;
        this.sendQueue = [];
        this.currentItem = null;
        this.currentTimer = null;
        this.knownCodes = new Set();
        this.isUnloaded = false;
        this.reopening = false;
        this.dongleSerial = '6FEDCB';
        this.unparsedRxCount = 0;
        this.readAnswerWaiter = null;
        this.initRunning = false;
        this.statusRefreshTimers = new Map();
        this.retainedReadingCount = 0;
        // Merkt sich, wann wegen einer externen Fernbedienungs-/Sensoränderung zuletzt ein Statuspoll geplant wurde.
        this.externalRefreshLast = new Map();
        // Zählt externe Telegramme, die einen nachgelagerten Statuspoll ausgelöst haben.
        this.externalRefreshCount = 0;
        // Timer für zyklische Statusabfragen aller bekannten Geräte. Einige Aktoren senden bei Bedienung per Fernbedienung keinen vollständigen Status an den USB-Stick.
        this.periodicStatusPollTimer = null;
        // Zähler und Diagnose für zyklische Statusabfragen.
        this.periodicStatusPollCount = 0;
        // Verhindert, dass mehrere Rundläufe gleichzeitig gestartet werden.
        this.periodicStatusPollActive = false;
        // Serialisiert die Verarbeitung eingehender Daten, damit Frames strikt nacheinander behandelt werden.
        this.rxChain = Promise.resolve();
        // Objekt-IDs, die in dieser Laufzeit bereits angelegt/aktualisiert wurden (spart Objekt-DB-Schreibzugriffe).
        this.ensuredObjects = new Set();
        // Geräte, deren Objektbaum in dieser Laufzeit bereits vollständig angelegt wurde.
        this.deviceObjectsReady = new Set();

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));
    }

    async onReady() {
        // Compatibility with the current GitHub/admin configuration names.
        // The proven runtime used `port`/`autoCreate`; newer GitHub builds used
        // `serialPort`/`autoCreateDevices`. Keep both working so existing
        // instances do not lose their configuration during upgrades.
        if (!this.config.port && this.config.serialPort) {
            this.config.port = this.config.serialPort;
        }
        if (!this.config.serialPort && this.config.port) {
            this.config.serialPort = this.config.port;
        }
        this.config.port = normalizeSerialPath(this.config.port || '');
        this.config.serialPort = this.config.port;
        if (typeof this.config.autoCreate === 'undefined' && typeof this.config.autoCreateDevices !== 'undefined') {
            this.config.autoCreate = this.config.autoCreateDevices;
        }
        if (typeof this.config.autoCreateDevices === 'undefined' && typeof this.config.autoCreate !== 'undefined') {
            this.config.autoCreateDevices = this.config.autoCreate;
        }
        this.dongleSerial = protocol.extractDongleSerial(this.config.dongleSerial || '');
        await this.ensureBaseObjects();
        await this.setStateSafe('info.connection', false, true);
        await this.setStateSafe('info.dongleSerial', this.dongleSerial, true);
        await this.setStateSafe('status.state', 'starting', true);
        await this.setStateSafe('info.lastError', '', true);
        await this.setStateSafe('info.lastParsed', '', true);
        await this.setStateSafe('info.lastStatusDecode', '', true);
        await this.setStateSafe('info.lastDeviceCode', '', true);
        await this.setStateSafe('info.unparsedRxCount', 0, true);
        await this.setStateSafe('info.retainedReadingCount', 0, true);
        await this.setStateSafe('info.lastRetainedReading', '', true);
        await this.setStateSafe('info.cleanedStateCount', 0, true);
        await this.setStateSafe('info.lastCleanup', '', true);
        await this.setStateSafe('info.externalRefreshCount', 0, true);
        await this.setStateSafe('info.lastExternalRefresh', '', true);
        await this.setStateSafe('info.periodicStatusPollCount', 0, true);
        await this.setStateSafe('info.lastPeriodicStatusPoll', '', true);
        await this.setStateSafe('queue.pending', 0, true);
        await this.setStateSafe('queue.active', false, true);
        await this.setStateSafe('pair.mode', 'off', true);

        this.subscribeStates('commands.*');
        // Root states are now writable too, so scripts/vis can use devices.<CODE>.up/down/stop/position directly.
        this.subscribeStates('devices.*.*');
        this.subscribeStates('devices.*.control.*');

        if (!SerialPort) {
            await this.fail('serialport dependency is not installed. Reinstall the adapter so npm can install serialport.');
            return;
        }

        if (!/^6F[0-9A-F]{4}$/i.test(this.dongleSerial)) {
            await this.fail(`Invalid DongleSerial "${this.config.dongleSerial}". Expected a 6 digit DuoFern stick radio code starting with 6F, e.g. 6F1A6F.`);
            return;
        }
        this.log.info(`Using DuoFern DongleSerial/radio code: ${this.dongleSerial}`);
        if (this.dongleSerial === '6FEDCB') {
            this.log.warn('DongleSerial is still the example/default 6FEDCB. Use the real 6 digit DuoFern stick radio code, e.g. 6F1A6F. Otherwise init may work but paired devices will not answer correctly.');
        }

        await this.loadKnownDeviceCodes();
        await this.setStateSafe('info.deviceCount', this.knownCodes.size, true);
        for (const code of this.knownCodes) {
            await this.createDeviceObjects(code, 'configured');
        }

        if (!this.config.port) {
            await this.fail('No serial port configured. Configure e.g. /dev/ttyUSB0, /dev/serial/by-id/... or COM5 in the adapter settings.');
            return;
        }

        await this.openSerialPort();
    }

    async ensureBaseObjects() {
        const objects = {
            'info.connection': { name: { en: 'Connection', de: 'Verbindung' }, type: 'boolean', role: 'indicator.connected', read: true, write: false, def: false },
            'info.rawRx': { name: { en: 'Last received raw telegram', de: 'Letztes empfangenes Rohtelegramm' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            'info.dongleSerial': { name: { en: 'Configured radio code / DongleSerial', de: 'Konfigurierter Funkcode / DongleSerial' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            'info.rawTx': { name: { en: 'Last transmitted raw telegram', de: 'Letztes gesendetes Rohtelegramm' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            'info.lastError': { name: { en: 'Last error', de: 'Letzter Fehler' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            'info.lastParsed': { name: { en: 'Last parsed telegram', de: 'Letztes geparstes Telegramm' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            'info.lastStatusDecode': { name: { en: 'Last status decode diagnostics', de: 'Letzte Status-Dekodierung Diagnose' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            'info.lastDeviceCode': { name: { en: 'Last detected device code', de: 'Letzter erkannter Gerätecode' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            'info.deviceCount': { name: { en: 'Known device count', de: 'Anzahl bekannter Geräte' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'info.unparsedRxCount': { name: { en: 'Received telegrams without detected device code', de: 'Empfangene Telegramme ohne erkannten Gerätecode' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'info.retainedReadingCount': { name: { en: 'Retained readings count', de: 'Beibehaltene Werte Zähler' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'info.lastRetainedReading': { name: { en: 'Last retained reading', de: 'Letzter beibehaltener Wert' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            'info.cleanedStateCount': { name: { en: 'Cleaned obsolete device states count', de: 'Bereinigte veraltete Gerätewerte Zähler' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'info.lastCleanup': { name: { en: 'Last device state cleanup', de: 'Letzte Gerätewerte-Bereinigung' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            'info.externalRefreshCount': { name: { en: 'External change status refresh count', de: 'Statusabfragen nach externen Änderungen' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'info.lastExternalRefresh': { name: { en: 'Last external status refresh trigger', de: 'Letzte externe Statusabfrage' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            'info.periodicStatusPollCount': { name: { en: 'Periodic status poll count', de: 'Zähler zyklische Statusabfragen' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'info.lastPeriodicStatusPoll': { name: { en: 'Last periodic status poll', de: 'Letzte zyklische Statusabfrage' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            'status.state': { name: { en: 'Adapter state', de: 'Adapter-Status' }, type: 'string', role: 'text', read: true, write: false, def: 'disconnected' },
            'queue.pending': { name: { en: 'Pending commands', de: 'Ausstehende Befehle' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            'queue.active': { name: { en: 'Command active', de: 'Befehl aktiv' }, type: 'boolean', role: 'indicator.working', read: true, write: false, def: false },
            'pair.mode': { name: { en: 'Pairing mode', de: 'Pairing-Modus' }, type: 'string', role: 'text', read: true, write: false, def: 'off' },
            'commands.pair': { name: { en: 'Start pairing for 60 seconds', de: 'Pairing für 60 Sekunden starten' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            'commands.unpair': { name: { en: 'Start unpairing for 60 seconds', de: 'Unpairing für 60 Sekunden starten' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            'commands.statusBroadcast': { name: { en: 'Status broadcast', de: 'Status-Broadcast' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            'commands.reopen': { name: { en: 'Reopen serial port', de: 'Seriellen Port neu öffnen' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            'commands.raw': { name: { en: 'Send raw 44 digit hex telegram', de: '44-stelliges Hex-Rohtelegramm senden' }, type: 'string', role: 'text', read: true, write: true, def: '' },
            'commands.remotePair': { name: { en: 'Remote pair device code', de: 'Remote-Pair Gerätecode' }, type: 'string', role: 'text', read: true, write: true, def: '' },
            'commands.addDeviceCode': { name: { en: 'Create device by code manually', de: 'Gerät per Code manuell anlegen' }, type: 'string', role: 'text', read: true, write: true, def: '' },
            'commands.cleanupUnusedDeviceStates': { name: { en: 'Clean unused device states', de: 'Ungenutzte Gerätewerte bereinigen' }, type: 'boolean', role: 'button', read: false, write: true, def: false }
        };

        const channels = {
            info: { en: 'Information', de: 'Information' },
            status: { en: 'Status', de: 'Status' },
            queue: { en: 'Command queue', de: 'Befehlswarteschlange' },
            pair: { en: 'Pairing', de: 'Pairing' },
            commands: { en: 'Commands', de: 'Befehle' },
            devices: { en: 'Devices', de: 'Geräte' }
        };

        for (const [id, name] of Object.entries(channels)) {
            await this.ensureChannelObject(id, { name }, {});
        }

        for (const [id, common] of Object.entries(objects)) {
            await this.ensureStateObject(id, common, {});
        }
    }

    async fail(message) {
        this.log.error(message);
        await this.setStateSafe('info.lastError', message, true);
        await this.setStateSafe('status.state', 'error', true);
        await this.setStateSafe('info.connection', false, true);
        await this.setStateSafe('info.dongleSerial', this.dongleSerial, true);
    }

    async setStateSafe(id, value, ack = true) {
        try {
            await this.setStateAsync(id, { val: value, ack });
        } catch (error) {
            this.log.debug(`Could not set state ${id}: ${error.message}`);
        }
    }

    async ensureStateObject(id, common, native = {}) {
        if (this.ensuredObjects.has(id)) {
            return;
        }
        try {
            const existing = await this.getObjectAsync(id).catch(() => null);
            if (existing) {
                await this.extendObjectAsync(id, {
                    type: 'state',
                    common: { ...(existing.common || {}), ...common },
                    native: { ...(existing.native || {}), ...native }
                });
            } else {
                await this.setObjectNotExistsAsync(id, { type: 'state', common, native });
            }
            this.ensuredObjects.add(id);
        } catch (error) {
            this.log.debug(`Could not ensure state object ${id}: ${error.message}`);
        }
    }

    async ensureChannelObject(id, common, native = {}) {
        if (this.ensuredObjects.has(id)) {
            return;
        }
        try {
            const existing = await this.getObjectAsync(id).catch(() => null);
            if (existing) {
                await this.extendObjectAsync(id, {
                    type: 'channel',
                    common: { ...(existing.common || {}), ...common },
                    native: { ...(existing.native || {}), ...native }
                });
            } else {
                await this.setObjectNotExistsAsync(id, { type: 'channel', common, native });
            }
            this.ensuredObjects.add(id);
        } catch (error) {
            this.log.debug(`Could not ensure channel object ${id}: ${error.message}`);
        }
    }

    async ensureDecodedStateObject(id, value, name) {
        const common = this.commonForDecodedState(name, value);
        await this.ensureStateObject(id, common, { dynamicReading: true, readingName: name, createdFrom: 'status' });
    }

    commonForDecodedState(name, value) {
        const labels = {
            statusGroup: { en: 'Status group', de: 'Statusgruppe' },
            statusPayload: { en: 'Status payload', de: 'Status-Nutzdaten' },
            statusPayloadOffset: { en: 'Status payload offset', de: 'Status-Nutzdaten Offset' },
            targetPosition: { en: 'Target position', de: 'Zielposition' },
            targetLevel: { en: 'Target level', de: 'Ziel-Level' },
            stateText: { en: 'State text', de: 'Status Text' },
            position: { en: 'Position', de: 'Position' },
            rawPosition: { en: 'Raw DuoFern position', de: 'Rohposition DuoFern' },
            level: { en: 'Level', de: 'Level' },
            state: { en: 'State', de: 'Zustand' },
            moving: { en: 'Moving', de: 'Bewegung' },
            manualMode: { en: 'Manual mode', de: 'Manueller Modus' },
            timeAutomatic: { en: 'Time automatic', de: 'Zeitautomatik' },
            sunAutomatic: { en: 'Sun automatic', de: 'Sonnenautomatik' },
            duskAutomatic: { en: 'Dusk automatic', de: 'Abenddämmerungsautomatik' },
            dawnAutomatic: { en: 'Dawn automatic', de: 'Morgendämmerungsautomatik' },
            sunMode: { en: 'Sun mode', de: 'Sonnenmodus' },
            ventilatingPosition: { en: 'Ventilating position', de: 'Lüftungsposition' },
            ventilatingMode: { en: 'Ventilating mode', de: 'Lüftungsmodus' },
            runningTime: { en: 'Running time', de: 'Laufzeit' },
            intermediateMode: { en: 'Intermediate mode', de: 'Zwischenwert-Modus' },
            intermediateValue: { en: 'Intermediate value', de: 'Zwischenwert' },
            sunPosition: { en: 'Sun position', de: 'Sonnenposition' },
            slatPosition: { en: 'Slat position', de: 'Lamellenposition' }
        };
        const label = labels[name] || { en: name, de: name };
        if (name === 'targetPosition') return { name: label, type: 'number', role: 'level.blind', read: true, write: false, min: 0, max: 100, unit: '%', def: 0 };
        if (name === 'position') return { name: label, type: 'number', role: 'level.blind', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 };
        if (name === 'rawPosition') return { name: label, type: 'number', role: 'value', read: true, write: false, min: 0, max: 100, unit: '%', def: 0 };
        if (name === 'targetLevel') return { name: label, type: 'number', role: 'level.dimmer', read: true, write: false, min: 0, max: 100, unit: '%', def: 0 };
        if (name === 'level') return { name: label, type: 'number', role: 'level.dimmer', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 };
        if (name === 'state') return { name: label, type: 'boolean', role: 'switch', read: true, write: true, def: false };
        if (typeof value === 'boolean') return { name: label, type: 'boolean', role: 'switch', read: true, write: true, def: false };
        if (typeof value === 'number') return { name: label, type: 'number', role: name.toLowerCase().includes('position') || name.toLowerCase().includes('level') || name.toLowerCase().includes('value') ? 'level' : 'value', read: true, write: true, def: 0 };
        return { name: label, type: 'string', role: 'text', read: true, write: true, def: '' };
    }

    async loadKnownDeviceCodes() {
        this.knownCodes.clear();
        try {
            for (const code of protocol.parseDeviceCodes(this.config.deviceCodes || '')) {
                this.knownCodes.add(code.substring(0, 6));
            }
        } catch (error) {
            this.log.warn(`Configured deviceCodes contain invalid entries: ${error.message}`);
        }

        try {
            const list = await this.getObjectListAsync({
                startkey: `${this.namespace}.devices.`,
                endkey: `${this.namespace}.devices.\u9999`
            });
            for (const row of list.rows || []) {
                const id = row.id || row.value?._id;
                const match = id && id.match(new RegExp(`^${this.namespace.replace('.', '\\.') }\\.devices\\.([0-9A-F]{6})(?:\\.|$)`, 'i'));
                if (match) {
                    this.knownCodes.add(match[1].toUpperCase());
                }
            }
        } catch (error) {
            this.log.debug(`Could not load existing device objects: ${error.message}`);
        }

        if (!this.knownCodes.size) {
            this.log.warn('No DuoFern device codes are known yet. No SetPairs frames are sent until device codes are configured, learned by pair mode or detected automatically.');
        }
    }

    async openSerialPort() {
        const path = normalizeSerialPath(this.config.port || this.config.serialPort || '');
        const baudRate = Number(this.config.baudRate || 115200);

        if (this.serial && this.serial.isOpen) {
            return;
        }

        await this.setStateSafe('status.state', 'connecting', true);

        this.serial = new SerialPort({
            path,
            baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            autoOpen: false
        });

        this.serial.on('data', data => {
            // Strikt sequenziell verarbeiten: ACK-, Queue- und readAnswer-Logik dürfen sich nicht überholen.
            this.rxChain = this.rxChain
                .then(() => this.handleSerialData(data))
                .catch(error => this.log.warn(`Error while processing received data: ${error.message}`));
        });

        this.serial.on('error', error => {
            void this.fail(`Serial port error: ${error.message}`);
        });

        this.serial.on('close', () => {
            void this.onSerialClose();
        });

        this.serial.open(async error => {
            if (error) {
                await this.fail(`Could not open serial port ${path}: ${error.message}`);
                this.scheduleReconnect();
                return;
            }
            this.log.info(`Serial port opened: ${path}@${baudRate}`);
            await this.setStateSafe('status.state', 'connected', true);

            if (this.config.initOnStart !== false) {
                const ok = await this.doDuoFernInit();
                // info.connection zeigt nur dann "verbunden", wenn der Stick auch initialisiert wurde.
                await this.setStateSafe('info.connection', ok, true);
                if (!ok) {
                    this.log.error('DuoFern init failed after retries. Serial port stays open, but commands may not work until reopen/init succeeds (commands.reopen).');
                }
            } else {
                await this.setStateSafe('info.connection', true, true);
                if (this.config.statusOnStart !== false) {
                    this.enqueueSend(protocol.constants.duoStatusBroadcast, { name: 'statusBroadcast', lowPriority: true });
                }
            }

            // Startet nach erfolgreichem Öffnen eine zyklische Statusabfrage.
            // Das ist wichtig für Rohrmotor-Aktoren, weil diese bei Bedienung über Handsender
            // nicht immer ein vollständig dekodierbares Status-Telegramm an den Stick liefern.
            this.startPeriodicStatusPolling();
        });
    }

    async onSerialClose() {
        await this.setStateSafe('info.connection', false, true);
        await this.setStateSafe('info.dongleSerial', this.dongleSerial, true);
        await this.setStateSafe('status.state', 'disconnected', true);
        this.log.warn('Serial port closed');
        this.stopPeriodicStatusPolling();
        this.currentItem = null;
        this.clearCurrentTimer();
        this.rejectReadAnswer(new Error('Serial port closed'));
        await this.updateQueueStates();
        if (!this.isUnloaded && !this.reopening) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.isUnloaded || this.reconnectTimer) {
            return;
        }
        const delay = Math.max(1000, Number(this.config.reconnectIntervalMs || 10000));
        this.reconnectTimer = this.setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.isUnloaded) {
                this.log.info('Trying to reconnect DuoFern stick');
                void this.openSerialPort();
            }
        }, delay);
    }

    async closeSerialPort() {
        if (!this.serial) {
            return;
        }
        const port = this.serial;
        this.serial = null;
        await new Promise(resolve => {
            try {
                if (port.isOpen) {
                    port.close(() => resolve());
                } else {
                    resolve();
                }
            } catch (error) {
                this.log.debug(`Serial close failed: ${error.message}`);
                resolve();
            }
        });
    }

    async reopenSerialPort() {
        this.log.info('Reopening serial port');
        this.reopening = true;
        if (this.reconnectTimer) {
            this.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        await this.closeSerialPort();
        this.reopening = false;
        await this.openSerialPort();
    }

    async handleSerialData(data) {
        const chunk = Buffer.from(data).toString('hex').toUpperCase();
        if (!chunk) {
            return;
        }

        if (this.flushTimer) {
            this.clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        this.partial += chunk;
        while (this.partial.length >= 44) {
            const frame = this.partial.substring(0, 44);
            this.partial = this.partial.substring(44);
            await this.handleFrame(frame);
        }

        if (this.partial.length > 0) {
            const timeout = Math.max(100, Number(this.config.flushPartialMs || 500));
            this.flushTimer = this.setTimeout(() => {
                if (this.partial) {
                    this.log.warn(`Discarding incomplete DuoFern buffer: ${this.partial}`);
                    this.partial = '';
                }
                this.flushTimer = null;
            }, timeout);
        }
    }

    async handleFrame(frame) {
        const raw = protocol.normalizeHex(frame);
        if (!protocol.isHex44(raw)) {
            this.log.warn(`Ignoring invalid frame length/content: ${raw}`);
            return;
        }

        if (this.config.debugRaw) {
            this.log.info(`rx -> ${raw}`);
        } else {
            this.log.debug(`rx -> ${raw}`);
        }

        await this.setStateSafe('info.rawRx', raw, true);

        if (this.readAnswerWaiter) {
            this.resolveReadAnswer(raw);
            return;
        }

        let parsed;
        try {
            parsed = protocol.parseTelegram(raw, this.dongleSerial);
        } catch (error) {
            await this.setStateSafe('info.lastError', error.message, true);
            return;
        }

        await this.setStateSafe('info.lastParsed', JSON.stringify(parsed), true);

        // Verarbeitungsreihenfolge für empfangene DuoFern-Frames:
        // 1. send ACK for every non-exact ACK frame
        // 2. if frame starts with 81, advance the write queue
        // 3. suppress exact ACK and 81000000.{36} control responses
        if (this.config.ackIncoming !== false && !parsed.isAck) {
            await this.writeDirect(protocol.constants.duoACK, 'ACK', false);
        }

        if (parsed.isQueueTrigger && this.currentItem) {
            await this.finishCurrentItem('ACK/81 response');
        }

        if (parsed.isAck || parsed.isStickControlAck) {
            return;
        }

        if (this.currentItem && this.currentItem.waitForResponse) {
            await this.finishCurrentItem(`response ${parsed.type}`);
        }

        if (/^0602/i.test(raw) && this.pairTimer) {
            this.clearTimeout(this.pairTimer);
            this.pairTimer = null;
            await this.setStateSafe('pair.mode', 'off', true);
        } else if (/^0603/i.test(raw) && this.unpairTimer) {
            this.clearTimeout(this.unpairTimer);
            this.unpairTimer = null;
            await this.setStateSafe('pair.mode', 'off', true);
        }

        if (/^0FFF11/i.test(raw)) {
            return;
        }

        const actorCommandAck = /^810003CC/i.test(raw);
        const actorMissingAck = /^810108AA/i.test(raw);
        const actorNotInitialized = /^81010C55/i.test(raw);

        if (parsed.deviceCode && this.config.autoCreate !== false) {
            const parsedCode = String(parsed.deviceCode).substring(0, 6).toUpperCase();
            await this.setStateSafe('info.lastDeviceCode', parsedCode, true);
            if (!this.deviceObjectsReady.has(parsedCode)) {
                await this.createDeviceObjects(parsed.deviceCode, 'auto');
            }
            await this.updateDeviceFromTelegram(parsed.deviceCode, parsed);

            if (actorCommandAck && this.isPollableDeviceCode(parsed.deviceCode)) {
                await this.scheduleExternalStatusRefresh(parsed.deviceCode, 'actor-ack-requests-status');
            } else if (actorMissingAck) {
                await this.setStateSafe(`devices.${parsed.deviceCode}.stateText`, 'MISSING ACK', true);
            } else if (actorNotInitialized) {
                await this.setStateSafe(`devices.${parsed.deviceCode}.stateText`, 'NOT INITIALIZED', true);
            }
            // Wenn das Telegramm von einer DuoFern-Fernbedienung, einem Wandtaster oder einem Sensor kommt,
            // steht darin oft nur der Sendercode. Der betroffene Rohrmotor-Aktor steht nicht eindeutig im Telegramm.
            // Dann werden alle bekannten Aktoren gezielt abgefragt, damit ioBroker wieder den echten Ist-Zustand zeigt.
            if (this.config.externalActivityPollAll !== false && this.isControllerTelegram(parsed)) {
                await this.scheduleControllerStatusPoll(parsed, 'controller-or-sensor-telegram');
            } else if (this.config.externalActivityPollAll !== false && parsed.deviceCode && this.isPollableDeviceCode(parsed.deviceCode) && /^(06|0F)$/i.test(parsed.type || '') && /^(07|0E)/i.test(parsed.payload || '')) {
                await this.scheduleExternalStatusRefresh(parsed.deviceCode, 'actuator-command-telegram');
            }
        } else {
            this.unparsedRxCount += 1;
            await this.setStateSafe('info.unparsedRxCount', this.unparsedRxCount, true);
            this.log.debug(`No DuoFern device code detected in telegram ${raw}`);
            // Wenn eine Fernbedienung oder ein Wandtaster ein Broadcast-/Kommando-Telegramm sendet,
            // kann es vorkommen, dass daraus kein eindeutiger Aktorcode extrahiert werden kann.
            // Damit Rohrmotor-Aktoren trotzdem aktuelle Werte bekommen, werden dann alle bekannten
            // Geräte kurz danach gezielt abgefragt.
            if (this.config.externalActivityPollAll !== false && /^(06|0F)/i.test(raw) && /^(07|0E)/i.test(raw.substring(4, 8))) {
                await this.setStateSafe('info.lastExternalRefresh', JSON.stringify({ device: null, reason: 'unparsed-external-telegram', time: new Date().toISOString() }), true);
                this.setTimeout(() => {
                    if (!this.isUnloaded) void this.pollKnownDeviceStatuses('unparsed-external');
                }, 2500);
            }
        }
    }

    isReliableDecodedStatus(decoded) {
        // Werte werden nur aus echten Aktor-Statusframes übernommen (0FFF0F...).
        // Damit können ACK-, Fernbedienungs- und Sensortelegramme keine Positionswerte mehr verfälschen.
        return Boolean(decoded && decoded.statusFrame === true && decoded.explicitGroup === true);
    }

    isPlausibleFallbackStatus(parsed, decoded) {
        // Keine Fallback-Dekodierung mehr: Nicht-Statusframes lösen höchstens eine spätere Statusabfrage aus.
        return false;
    }


    isPollableDeviceCode(code) {
        const cls = protocol.deviceClass(code);
        return ['rollerShutter', 'troll', 'rolloTube', 'switchActor', 'dimmer', 'sx5', 'thermostat', 'heatingActuator'].includes(cls);
    }

    isControllerTelegram(parsed) {
        if (!parsed) return false;
        const cls = String(parsed.deviceClass || '').toLowerCase();
        const controllerClasses = new Set(['transmitter', 'wallswitch', 'hometimer', 'central', 'sunsensor', 'sunwindsensor', 'awningsensor', 'smokedetector', 'windowcontact', 'environmentsensor']);
        const payloadHead = String(parsed.payload || '').substring(0, 4).toUpperCase();
        if (controllerClasses.has(cls)) return true;
        if (/^(0701|0702|0703|0718|0719|071A|0E01|0E02|0E03)$/.test(payloadHead)) return true;
        if (String(parsed.targetCode || '').toUpperCase() === 'FFFFFF' && /^(07|0E)/.test(payloadHead)) return true;
        return false;
    }

    async scheduleControllerStatusPoll(parsed, reason = 'controller-telegram') {
        this.externalRefreshCount += 1;
        const info = {
            device: parsed && parsed.deviceCode ? parsed.deviceCode : null,
            deviceClass: parsed && parsed.deviceClass ? parsed.deviceClass : null,
            payload: parsed && parsed.payload ? parsed.payload : null,
            reason,
            time: new Date().toISOString()
        };
        await this.setStateSafe('info.externalRefreshCount', this.externalRefreshCount, true);
        await this.setStateSafe('info.lastExternalRefresh', JSON.stringify(info), true);
        this.setTimeout(() => {
            if (!this.isUnloaded) void this.pollKnownDeviceStatuses(reason);
        }, 1500);
        this.setTimeout(() => {
            if (!this.isUnloaded) void this.pollKnownDeviceStatuses(`${reason}-late`);
        }, 8000);
    }

    async scheduleExternalStatusRefresh(code, reason = 'external-telegram') {
        // Bei Bedienung per Fernbedienung sendet der Aktor normalerweise eine Statusmeldung.
        // Falls diese nicht eindeutig dekodierbar ist, fragt der Adapter den Status kurz verzögert aktiv ab.
        let deviceCode;
        try {
            deviceCode = protocol.normalizeDeviceCode(code).substring(0, 6).toUpperCase();
        } catch (error) {
            return;
        }
        const now = Date.now();
        const last = this.externalRefreshLast.get(deviceCode) || 0;
        if (now - last < 4000) return;
        this.externalRefreshLast.set(deviceCode, now);
        this.externalRefreshCount += 1;
        await this.setStateSafe('info.externalRefreshCount', this.externalRefreshCount, true);
        await this.setStateSafe('info.lastExternalRefresh', JSON.stringify({ device: deviceCode, reason, time: new Date(now).toISOString() }), true);
        this.log.debug(`External DuoFern activity for ${deviceCode}; scheduling status refresh (${reason}).`);
        this.scheduleStatusRefresh(deviceCode, 'external');
        // Bei Handsender-/Wandtasterbedienung senden manche Aktoren nur ein Kommando- oder
        // Bewegungs-Telegramm, nicht aber den vollständigen Endstatus. Darum optional alle
        // bekannten Aktoren kurz nachpolling, damit auch Rohrmotor-Aktoren aktuelle Werte bekommen.
        if (this.config.externalActivityPollAll !== false) {
            this.setTimeout(() => {
                if (!this.isUnloaded) void this.pollKnownDeviceStatuses('external-activity');
            }, 2500);
        }
    }

    isStickyDecodedReading(reading) {
        const technical = new Set(['statusGroup', 'statusPayload', 'statusPayloadOffset', 'stateText']);
        if (technical.has(reading)) return false;
        return true;
    }

    valuesEqual(a, b) {
        if (typeof a === 'number' || typeof b === 'number') {
            const na = Number(a);
            const nb = Number(b);
            return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
        }
        return String(a) === String(b);
    }

    isSuspiciousZeroOverwrite(reading, currentValue, newValue, decoded = {}) {
        if (decoded && decoded.statusFrame === true) return false;
        // Sicherheitsnetz für falsch ausgerichtete Statusrahmen: Wenn ein kompletter Statusblock
        // als 0-Payload dekodiert wird, darf er bestehende Werte nicht löschen.
        if (!decoded || decoded.payloadAllZero !== true) return false;
        if (currentValue === undefined || currentValue === null || currentValue === '') return false;
        const protectedReadings = new Set([
            'position', 'rawPosition', 'level', 'runningTime', 'sunPosition', 'ventilatingPosition',
            'intermediateValue', 'slatPosition', 'sunAutomatic', 'timeAutomatic', 'duskAutomatic',
            'dawnAutomatic', 'manualMode', 'sunMode', 'ventilatingMode', 'windAutomatic',
            'rainAutomatic', 'state', 'moving'
        ]);
        if (!protectedReadings.has(reading)) return false;
        const curNum = Number(currentValue);
        const newNum = Number(newValue);
        if (Number.isFinite(curNum) && Number.isFinite(newNum)) return curNum !== 0 && newNum === 0;
        if (typeof currentValue === 'boolean' || typeof newValue === 'boolean') return currentValue === true && newValue === false;
        if (String(newValue).toLowerCase() === 'stop' && String(currentValue).toLowerCase() !== 'stop') return true;
        if (String(newValue) === '0' && String(currentValue) !== '0') return true;
        return false;
    }

    async retainDecodedReading(base, reading, currentValue, newValue, meta, decoded) {
        this.retainedReadingCount += 1;
        const info = {
            device: base.replace(/^devices\./, ''),
            reading,
            kept: currentValue,
            ignored: newValue,
            reason: decoded && decoded.explicitGroup === true ? 'unchanged value was not written again' : 'fallback status telegram ignored because it is not a reliable value source or because an active status refresh was scheduled',
            valueSource: meta && meta.valueSource ? meta.valueSource : (decoded && decoded.quality ? decoded.quality : 'unknown'),
            group: meta && meta.group,
            payloadStart: meta && meta.payloadStart,
            rawValue: meta && meta.rawValue,
            explicitGroup: Boolean(decoded && decoded.explicitGroup),
            payloadAllZero: Boolean(decoded && decoded.payloadAllZero),
            time: new Date().toISOString()
        };
        await this.setStateSafe('info.retainedReadingCount', this.retainedReadingCount, true);
        await this.setStateSafe('info.lastRetainedReading', JSON.stringify(info), true);
        this.log.debug(`Retained ${base}.${reading}: kept ${currentValue}, ignored ${newValue} from ${info.valueSource}`);
    }

    async shouldUpdateDecodedReading(base, reading, value, meta = {}, decoded = {}) {
        // DuoFern liefert neben echten Statusmeldungen auch ACK- und Antworttelegramme,
        // deren Nutzdaten zufällig wie Statuswerte aussehen können.
        // Solche Fallback-Dekodierungen bleiben Diagnose und dürfen keine ioBroker-Werte setzen.
        const state = await this.getStateAsync(`${base}.${reading}`).catch(() => null);

        if (!this.isReliableDecodedStatus(decoded)) {
            await this.retainDecodedReading(base, reading, state ? state.val : undefined, value, meta, decoded);
            return false;
        }

        if (state && this.isSuspiciousZeroOverwrite(reading, state.val, value, decoded)) {
            await this.retainDecodedReading(base, reading, state.val, value, meta, decoded);
            return false;
        }

        if (state && this.valuesEqual(state.val, value)) return false;
        return true;
    }

    async updateDeviceFromTelegram(code, parsed) {
        const deviceCode = code.substring(0, 6).toUpperCase();
        const base = `devices.${deviceCode}`;
        await this.setStateSafe(`${base}.raw`, parsed.raw, true);
        await this.setStateSafe(`${base}.lastSeen`, new Date().toISOString(), true);
        await this.setStateSafe(`${base}.messageType`, parsed.type, true);
        await this.setStateSafe(`${base}.channel`, parsed.channel, true);
        await this.setStateSafe(`${base}.payload`, parsed.payload, true);
        await this.setStateSafe(`${base}.sourceCode`, parsed.sourceCode, true);
        await this.setStateSafe(`${base}.targetCode`, parsed.targetCode, true);
        await this.setStateSafe(`${base}.deviceClass`, parsed.deviceClass, true);
        await this.setStateSafe(`${base}.deviceProfile`, protocol.deviceCommandProfile(deviceCode).profile, true);

        let decoded = { group: null, readings: {}, readingMeta: {} };
        try {
            decoded = protocol.decodeStatusTelegram(parsed.raw, deviceCode, parsed.channel || '01');
        } catch (error) {
            this.log.debug(`Status decode failed for ${deviceCode}: ${error.message}`);
        }

        // Externe Fernbedienungen liefern in der Praxis nicht immer genau das gleiche Layout wie ein aktiv abgefragter Status.
        // Darum akzeptieren wir plausible Fallback-Statuswerte, wenn sie nicht leer sind und echte Istwerte enthalten.
        decoded.acceptedFallback = this.isPlausibleFallbackStatus(parsed, decoded);
        if (!this.isReliableDecodedStatus(decoded) && Object.keys(decoded.readings || {}).length > 0) {
            await this.scheduleExternalStatusRefresh(deviceCode, 'unreliable-status-layout');
        }

        if (decoded.group) {
            await this.setStateSafe(`${base}.statusGroup`, decoded.group, true);
        }
        await this.setStateSafe(`${base}.statusPayload`, decoded.payload || parsed.payload || '', true);
        if (decoded.payloadStart !== undefined && decoded.payloadStart !== null) {
            await this.ensureDecodedStateObject(`${base}.statusPayloadOffset`, decoded.payloadStart, 'statusPayloadOffset');
            await this.setStateSafe(`${base}.statusPayloadOffset`, decoded.payloadStart, true);
        }

        const decodeInfo = {
            raw: parsed.raw,
            code: deviceCode,
            group: decoded.group || null,
            payload: decoded.payload || parsed.payload || '',
            payloadStart: decoded.payloadStart ?? null,
            payloadAllZero: Boolean(decoded.payloadAllZero),
            explicitGroup: Boolean(decoded.explicitGroup),
            reliable: this.isReliableDecodedStatus(decoded),
            acceptedFallback: Boolean(decoded.acceptedFallback),
            ignoredFallback: !this.isReliableDecodedStatus(decoded) && Object.keys(decoded.readings || {}).length > 0,
            readingMeta: decoded.readingMeta || {}
        };
        await this.setStateSafe('info.lastStatusDecode', JSON.stringify(decodeInfo), true);

        const profileContext = await this.readCurrentDeviceProfileContext(deviceCode);
        const previousBlindsMode = profileContext.blindsMode;
        if (decoded.readings && decoded.readings.blindsMode !== undefined) profileContext.blindsMode = decoded.readings.blindsMode;
        this.applyPositionInversionToReadings(decoded);
        for (const [reading, value] of Object.entries(decoded.readings || {})) {
            const meta = decoded.readingMeta && decoded.readingMeta[reading] ? decoded.readingMeta[reading] : {};
            if (!this.isProfileReadingAllowed(deviceCode, reading, profileContext)) {
                await this.retainDecodedReading(base, reading, '(not part of device profile)', value, meta, { ...decoded, quality: 'profile-filtered' });
                continue;
            }
            await this.ensureDecodedStateObject(`${base}.${reading}`, value, reading);
            const shouldUpdate = await this.shouldUpdateDecodedReading(base, reading, value, meta, decoded);
            if (shouldUpdate) {
                await this.setStateSafe(`${base}.${reading}`, value, true);
            }
        }
        if (decoded.readings && decoded.readings.blindsMode !== undefined && Boolean(decoded.readings.blindsMode) !== Boolean(previousBlindsMode)) {
            // Profil (Jalousie-/Rollladenmodus) hat sich geändert: Objektbaum neu abgleichen.
            this.deviceObjectsReady.delete(deviceCode);
            await this.createDeviceObjects(deviceCode, 'profile-refresh');
        }

        // Extra diagnostic for shutter positions: rawPosition is the telegram value.
        // position now intentionally uses the same value, so input and display are identical.
        // Keeping both values visible makes protocol checks and device comparisons easier.
        if (this.isReliableDecodedStatus(decoded) && decoded.readings && decoded.readings.position !== undefined) {
            // rawPosition soll in diesem Adapter den gleichen, sichtbaren Bedienwert zeigen wie position.
            // Der interne Protokoll-Rohwert bleibt bei Bedarf in info.lastStatusDecode.readingMeta.position.rawValue sichtbar.
            const rawPos = this.config.invertPosition ? 100 - decoded.readings.position : decoded.readings.position;
            await this.ensureDecodedStateObject(`${base}.rawPosition`, rawPos, 'rawPosition');
            await this.setStateSafe(`${base}.rawPosition`, rawPos, true);
        }

        let stateText = '';
        // Nur echte Status-Telegramme ändern den sichtbaren Zustandstext.
        // Unsichere Fallbacks bleiben reine Diagnose.
        if (this.isReliableDecodedStatus(decoded) && decoded.readings && decoded.readings.position !== undefined) {
            stateText = `position ${decoded.readings.position}%`;
        } else if (this.isReliableDecodedStatus(decoded) && decoded.readings && decoded.readings.level !== undefined) {
            stateText = `level ${decoded.readings.level}%`;
        } else if (this.isReliableDecodedStatus(decoded) && decoded.readings && decoded.readings.state !== undefined) {
            stateText = decoded.readings.state ? 'on' : 'off';
        } else if (this.isReliableDecodedStatus(decoded) && decoded.readings && decoded.readings.moving !== undefined) {
            stateText = String(decoded.readings.moving);
        }
        if (stateText) {
            await this.setStateSafe(`${base}.stateText`, stateText, true);
        }

        const enriched = { ...parsed, decoded };
        await this.setStateSafe(`${base}.lastDecoded`, JSON.stringify(enriched), true);
    }

    async doDuoFernInit() {
        if (this.initRunning) {
            return false;
        }
        this.initRunning = true;
        const codes = Array.from(this.knownCodes).filter(code => protocol.isDeviceCode(code));
        this.log.info(`Starting DuoFern init sequence with ${codes.length} known device(s)`);
        await this.setStateSafe('status.state', 'initializing', true);

        try {
            for (let attempt = 1; attempt <= 4; attempt++) {
                this.log.debug(`DuoFern init attempt ${attempt}/4`);
                try {
                    await this.sendAndReadAnswer(protocol.constants.duoInit1, 'INIT1');
                    await this.sendAndReadAnswer(protocol.constants.duoInit2, 'INIT2');

                    await this.sendAndReadAnswer(protocol.constants.duoSetDongle, 'SetDongle');
                    await this.writeDirect(protocol.constants.duoACK, 'ACK after SetDongle', false);

                    await this.sendAndReadAnswer(protocol.constants.duoInit3, 'INIT3');
                    await this.writeDirect(protocol.constants.duoACK, 'ACK after INIT3', false);

                    let counter = 0;
                    for (const code of codes) {
                        const pairFrame = protocol.constants.duoSetPairs
                            .replace('nn', (counter & 0xff).toString(16).padStart(2, '0').toUpperCase())
                            .replace('yyyyyy', code.substring(0, 6));
                        counter += 1;
                        try {
                            await this.sendAndReadAnswer(pairFrame, `SetPairs ${code.substring(0, 6)}`);
                            await this.writeDirect(protocol.constants.duoACK, `ACK after SetPairs ${code.substring(0, 6)}`, false);
                        } catch (pairError) {
                            // Mirrors the Perl foreach behavior: a single SetPairs timeout does not abort
                            // the whole adapter start, but it is logged.
                            this.log.warn(`SetPairs for ${code.substring(0, 6)} failed: ${pairError.message}`);
                        }
                    }

                    await this.sendAndReadAnswer(protocol.constants.duoInitEnd, 'INIT_END');
                    await this.writeDirect(protocol.constants.duoACK, 'ACK after INIT_END', false);

                    if (this.config.statusOnStart !== false) {
                        await this.sendAndReadAnswer(protocol.constants.duoStatusBroadcast, 'statusRequest');
                        await this.writeDirect(protocol.constants.duoACK, 'ACK after statusRequest', false);
                    }

                    await this.setStateSafe('status.state', 'Initialized', true);
                    this.log.info('DuoFern stick initialized successfully');
                    return true;
                } catch (error) {
                    this.log.warn(`DuoFern init attempt ${attempt}/4 failed: ${error.message}`);
                    await this.setStateSafe('info.lastError', `init attempt ${attempt}: ${error.message}`, true);
                    this.rejectReadAnswer(error);
                }
            }
            await this.setStateSafe('status.state', 'Init fail', true);
            return false;
        } finally {
            this.initRunning = false;
        }
    }

    async sendAndReadAnswer(hex, label) {
        if (this.readAnswerWaiter) {
            throw new Error(`Cannot send ${label}: another readAnswer is active (${this.readAnswerWaiter.label})`);
        }

        const timeoutMs = Math.max(500, Number(this.config.readAnswerTimeoutMs || this.config.commandTimeoutMs || 1000));
        const answerPromise = new Promise((resolve, reject) => {
            const timer = this.setTimeout(() => {
                if (this.readAnswerWaiter && this.readAnswerWaiter.label === label) {
                    this.readAnswerWaiter = null;
                }
                reject(new Error(`Timeout reading answer for ${label}`));
            }, timeoutMs);
            this.readAnswerWaiter = { label, resolve, reject, timer };
        });

        const ok = await this.writeDirect(hex, label, false);
        if (!ok) {
            this.rejectReadAnswer(new Error(`Write failed for ${label}`));
            throw new Error(`Write failed for ${label}`);
        }

        const answer = await answerPromise;
        this.log.debug(`Command finished (${label}): readAnswer ${answer}`);
        return answer;
    }

    resolveReadAnswer(frame) {
        const waiter = this.readAnswerWaiter;
        if (!waiter) {
            return;
        }
        this.readAnswerWaiter = null;
        this.clearTimeout(waiter.timer);
        this.log.debug(`readAnswer (${waiter.label}) <- ${frame}`);
        waiter.resolve(frame);
    }

    rejectReadAnswer(error) {
        const waiter = this.readAnswerWaiter;
        if (!waiter) {
            return;
        }
        this.readAnswerWaiter = null;
        this.clearTimeout(waiter.timer);
        waiter.reject(error);
    }

    enqueueInitSequence() {
        // Retained for compatibility with earlier builds. The real startup now uses doDuoFernInit(),
        // because DuoFern initializes synchronously via DUOFERNSTICK_ReadAnswer instead of the async
        // send queue used for normal commands.
        void this.doDuoFernInit();
    }

    enqueueSend(hex, options = {}) {
        const item = {
            hex: String(hex || '').replace(/\s+/g, '').toUpperCase(),
            name: options.name || 'command',
            waitForAck: options.waitForAck !== false,
            waitForResponse: Boolean(options.waitForResponse),
            lowPriority: Boolean(options.lowPriority)
        };
        // Identische, noch wartende Telegramme nicht doppelt senden (spart Funk-Sendezeit / Duty Cycle).
        if (this.sendQueue.some(queued => queued.hex === item.hex)) {
            this.log.debug(`Skipping duplicate queued telegram (${item.name})`);
            return;
        }
        if (item.lowPriority) {
            if (this.sendQueue.length >= MAX_QUEUE_LENGTH) {
                this.log.debug(`Send queue full (${this.sendQueue.length}); dropping status request ${item.name}`);
                return;
            }
            this.sendQueue.push(item);
        } else {
            // Bedienbefehle vor wartende Statusabfragen einreihen, damit sie ohne Verzögerung rausgehen.
            const firstLow = this.sendQueue.findIndex(queued => queued.lowPriority);
            if (firstLow === -1) {
                this.sendQueue.push(item);
            } else {
                this.sendQueue.splice(firstLow, 0, item);
            }
        }
        void this.updateQueueStates();
        void this.processQueue();
    }

    async processQueue() {
        if (this.currentItem || this.isUnloaded) {
            return;
        }
        if (!this.sendQueue.length) {
            await this.setStateSafe('status.state', 'CMDs_done', true);
            await this.updateQueueStates();
            return;
        }

        const item = this.sendQueue.shift();
        this.currentItem = item;
        await this.updateQueueStates();
        await this.setStateSafe('status.state', `${this.sendQueue.length + 1} CMDs_pending`, true);

        const ok = await this.writeDirect(item.hex, item.name, item.waitForAck || item.waitForResponse);
        if (!ok) {
            await this.finishCurrentItem('write failed');
            return;
        }

        if (!item.waitForAck && !item.waitForResponse) {
            await this.finishCurrentItem('no wait');
            return;
        }

        const timeout = Math.max(1000, Number(this.config.commandTimeoutMs || 5000));
        this.currentTimer = this.setTimeout(() => {
            const name = this.currentItem ? this.currentItem.name : 'unknown';
            this.log.warn(`Timeout while waiting for DuoFern answer/ACK for ${name}; continuing queue`);
            void this.finishCurrentItem('timeout');
        }, timeout);
    }

    async finishCurrentItem(reason) {
        if (!this.currentItem) {
            return;
        }
        const finished = this.currentItem;
        this.currentItem = null;
        this.clearCurrentTimer();
        this.log.debug(`Command finished (${finished.name}): ${reason}`);
        await this.updateQueueStates();
        setImmediate(() => void this.processQueue());
    }

    clearCurrentTimer() {
        if (this.currentTimer) {
            this.clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }
    }

    async updateQueueStates() {
        await this.setStateSafe('queue.pending', this.sendQueue.length + (this.currentItem ? 1 : 0), true);
        await this.setStateSafe('queue.active', Boolean(this.currentItem), true);
    }

    async writeDirect(hex, label = 'raw', expectAnswer = false) {
        const serial = this.serial;
        if (!serial || !serial.isOpen) {
            const message = `Cannot send ${label}: serial port is not open`;
            this.log.warn(message);
            await this.setStateSafe('info.lastError', message, true);
            return false;
        }

        let raw = String(hex || '').replace(/\s+/g, '').toUpperCase().replace(/ZZZZZZ/g, this.dongleSerial);
        raw = protocol.normalizeHex(raw);
        if (!protocol.isHex44(raw)) {
            const message = `Cannot send ${label}: invalid 44 hex telegram "${raw}"`;
            this.log.error(message);
            await this.setStateSafe('info.lastError', message, true);
            return false;
        }

        if (this.config.debugRaw || label === 'raw') {
            this.log.info(`snd -> ${raw}`);
        } else {
            this.log.debug(`snd -> ${raw}`);
        }
        await this.setStateSafe('info.rawTx', raw, true);

        return new Promise(resolve => {
            try {
                serial.write(Buffer.from(raw, 'hex'), error => {
                    if (error) {
                        void this.setStateSafe('info.lastError', error.message, true);
                        this.log.error(`Serial write failed: ${error.message}`);
                        resolve(false);
                        return;
                    }
                    serial.drain(drainError => {
                        if (drainError) {
                            void this.setStateSafe('info.lastError', drainError.message, true);
                            this.log.error(`Serial drain failed: ${drainError.message}`);
                            resolve(false);
                            return;
                        }
                        resolve(true);
                    });
                });
            } catch (error) {
                void this.setStateSafe('info.lastError', error.message, true);
                this.log.error(`Serial write exception: ${error.message}`);
                resolve(false);
            }
        });
    }

    async onStateChange(id, state) {
        if (!state || state.ack || this.isUnloaded) {
            return;
        }
        const rel = id.startsWith(`${this.namespace}.`) ? id.substring(this.namespace.length + 1) : id;

        try {
            if (rel.startsWith('commands.')) {
                await this.handleBridgeCommand(rel.substring('commands.'.length), state.val);
                return;
            }

            const match = rel.match(/^devices\.([0-9A-F]{6})(?:\.control\.([A-Za-z0-9_-]+)|\.([A-Za-z0-9_-]+))$/i);
            if (!match) {
                return;
            }
            const code = match[1].toUpperCase();
            const controlCommand = match[2];
            const directState = match[3];

            if (controlCommand) {
                await this.handleDeviceCommand(code, controlCommand, state.val, `devices.${code}.control.${controlCommand}`);
                return;
            }

            if (directState === 'command') {
                await this.handleDeviceTextCommand(code, String(state.val || ''));
                return;
            }
            if (directState === 'raw') {
                await this.handleDeviceCommand(code, 'raw', state.val, `devices.${code}.raw`);
                return;
            }

            const mapped = this.mapWritableDeviceStateToCommand(directState, state.val);
            if (mapped) {
                await this.handleDeviceCommand(code, mapped.command, mapped.value, `devices.${code}.${directState}`);
            }
        } catch (error) {
            this.log.error(error.stack || error.message);
            await this.setStateSafe('info.lastError', error.message, true);
        }
    }

    mapWritableDeviceStateToCommand(stateName, value) {
        const name = String(stateName || '').trim();
        if (!name) return null;
        if (name === 'lastCommand' || name === 'lastCommandTime' || name === 'lastSeen' || name === 'lastDecoded' || name === 'payload' || name === 'messageType' || name === 'channel' || name === 'sourceCode' || name === 'targetCode' || name === 'deviceClass' || name === 'statusGroup' || name === 'statusPayload' || name === 'statusPayloadOffset' || name === 'rawPosition' || name === 'targetPosition' || name === 'targetLevel' || name === 'stateText' || name === 'moving') {
            return null;
        }
        if (name === 'state') return { command: value ? 'on' : 'off', value: undefined };
        if (name === 'position' || name === 'level') return { command: name, value };
        const buttonCommands = new Set(['up', 'down', 'stop', 'toggle', 'dusk', 'dawn', 'getStatus', 'getWeather', 'getTime', 'remotePair', 'remoteUnpair', 'reset']);
        if (buttonCommands.has(name)) {
            if (value === false || value === 0 || value === null || value === '') return null;
            return { command: name, value: undefined };
        }
        if (protocol.commands && protocol.commands[name]) {
            const spec = protocol.commands[name];
            if (typeof value === 'boolean' && spec.cmd && (spec.cmd.on !== undefined || spec.cmd.off !== undefined)) {
                return { command: name, value: value ? 'on' : 'off' };
            }
            return { command: name, value };
        }
        return null;
    }

    async handleBridgeCommand(command, value) {
        switch (command) {
            case 'pair':
                if (value) {
                    await this.startPairMode();
                }
                break;
            case 'unpair':
                if (value) {
                    await this.startUnpairMode();
                }
                break;
            case 'statusBroadcast':
                if (value) {
                    this.enqueueSend(protocol.constants.duoStatusBroadcast, { name: 'statusBroadcast' });
                }
                break;
            case 'reopen':
                if (value) {
                    await this.reopenSerialPort();
                }
                break;
            case 'raw': {
                const raw = protocol.normalizeHex(value);
                if (raw) {
                    if (!protocol.isHex44(raw)) {
                        throw new Error('raw expects a 44 digit hex telegram');
                    }
                    this.enqueueSend(raw, { name: 'raw' });
                    await this.setStateSafe('commands.raw', '', true);
                }
                break;
            }
            case 'remotePair': {
                const code = protocol.normalizeHex(value);
                if (code) {
                    this.enqueueSend(protocol.buildRemotePairStick(code), { name: `remotePair ${code}` });
                    await this.setStateSafe('commands.remotePair', '', true);
                }
                break;
            }
            case 'addDeviceCode': {
                const code = protocol.normalizeHex(value);
                if (code) {
                    await this.createDeviceObjects(code, 'manual');
                    await this.setStateSafe('commands.addDeviceCode', '', true);
                    this.enqueueSend(protocol.buildStatusRequest(code.substring(0, 6), 'getStatus'), { name: `getStatus ${code.substring(0, 6)}` });
                }
                break;
            }
            case 'cleanupUnusedDeviceStates': {
                if (value) {
                    const cleaned = await this.cleanupAllDeviceObjects('manual');
                    await this.setStateSafe('commands.cleanupUnusedDeviceStates', false, true);
                    this.log.info(`Cleaned ${cleaned} unused DuoFern device state object(s).`);
                }
                break;
            }
            default:
                this.log.warn(`Unknown bridge command: ${command}`);
        }
    }

    async startPairMode() {
        if (this.unpairTimer) {
            this.clearTimeout(this.unpairTimer);
            this.unpairTimer = null;
        }
        if (this.pairTimer) {
            this.clearTimeout(this.pairTimer);
        }
        this.enqueueSend(protocol.constants.duoStartPair, { name: 'pair' });
        await this.setStateSafe('pair.mode', 'pair', true);
        this.pairTimer = this.setTimeout(() => {
            this.pairTimer = null;
            this.enqueueSend(protocol.constants.duoStopPair, { name: 'stopPair' });
            void this.setStateSafe('pair.mode', 'off', true);
        }, 60000);
    }

    async startUnpairMode() {
        if (this.pairTimer) {
            this.clearTimeout(this.pairTimer);
            this.pairTimer = null;
        }
        if (this.unpairTimer) {
            this.clearTimeout(this.unpairTimer);
        }
        this.enqueueSend(protocol.constants.duoStartUnpair, { name: 'unpair' });
        await this.setStateSafe('pair.mode', 'unpair', true);
        this.unpairTimer = this.setTimeout(() => {
            this.unpairTimer = null;
            this.enqueueSend(protocol.constants.duoStopUnpair, { name: 'stopUnpair' });
            void this.setStateSafe('pair.mode', 'off', true);
        }, 60000);
    }

    async handleDeviceTextCommand(code, commandLine) {
        const trimmed = commandLine.trim();
        if (!trimmed) {
            return;
        }
        const parts = trimmed.split(/\s+/);
        const command = parts.shift();
        const arg = parts.join(' ');
        await this.handleDeviceCommand(code, command, arg);
        await this.setStateSafe(`devices.${code}.command`, '', true);
    }

    async handleDeviceCommand(code, command, value, triggerStateId = null) {
        const normalizedCommand = String(command || '').trim();
        if (!normalizedCommand) {
            return;
        }

        const profileContext = await this.readCurrentDeviceProfileContext(code.substring(0, 6).toUpperCase());
        if (!this.isProfileCommandAllowed(code, normalizedCommand, profileContext)) {
            const message = `Command ${normalizedCommand} is not available for device ${code} (${protocol.deviceCommandProfile(code, profileContext).profile})`;
            this.log.warn(message);
            await this.setStateSafe('info.lastError', message, true);
            if (triggerStateId) await this.setStateSafe(triggerStateId, false, true).catch(() => {});
            return;
        }

        const noArgButtons = new Set(['up', 'down', 'stop', 'toggle', 'dusk', 'dawn', 'getStatus', 'getWeather', 'getTime', 'getConfig', 'writeConfig', 'time', 'remotePair', 'remoteUnpair', 'tempUp', 'tempDown']);
        let arg = value;
        const spec = protocol.commands ? protocol.commands[normalizedCommand] : null;

        if (noArgButtons.has(normalizedCommand)) {
            if (value === false || value === 0 || value === null || value === '') return;
            arg = undefined;
        } else if (typeof value === 'boolean' && spec && spec.cmd && (spec.cmd.on !== undefined || spec.cmd.off !== undefined)) {
            arg = value ? 'on' : 'off';
        } else if ((normalizedCommand === 'on' || normalizedCommand === 'off') && typeof value === 'boolean') {
            if (!value) return;
            arg = undefined;
        }

        let frames;
        if (normalizedCommand === 'getConfig') {
            frames = [protocol.constants.duoWeatherConfig.replace('yyyyyy', code.substring(0, 6).toUpperCase())];
        } else if (normalizedCommand === 'time') {
            const now = new Date();
            const jsDay = now.getDay();
            const duoWeekday = jsDay === 0 ? 7 : jsDay - 1;
            const mm = String(now.getFullYear() - 2000).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0') + String(duoWeekday).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const nn = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
            frames = [protocol.constants.duoSetTime.replace('mmmmmmmm', mm).replace('nnnnnn', nn).replace('yyyyyy', code.substring(0, 6).toUpperCase())];
        } else if (normalizedCommand === 'position' && this.config.invertPosition) {
            frames = protocol.buildDeviceCommand(code, normalizedCommand, this.invertPercent(arg), { channel: '01', positionInverse: false });
        } else if (normalizedCommand === 'writeConfig') {
            throw new Error('writeConfig requires weather register values and is not sent automatically to avoid overwriting sensor configuration');
        } else {
            frames = protocol.buildDeviceCommand(code, normalizedCommand, arg, { channel: '01', positionInverse: false });
        }
        for (const frame of frames) {
            this.enqueueSend(frame, { name: `${code} ${normalizedCommand}` });
        }
        await this.updateLocalCommandState(code, normalizedCommand, arg);

        // Mirror button states back to false, otherwise ioBroker UIs keep them activated.
        if (triggerStateId && noArgButtons.has(normalizedCommand)) {
            await this.setStateSafe(triggerStateId, false, true);
        }
        if (triggerStateId && (normalizedCommand === 'on' || normalizedCommand === 'off') && triggerStateId.endsWith(`.${normalizedCommand}`)) {
            await this.setStateSafe(triggerStateId, false, true);
        }

        // After a movement command the actor often answers first with the old value and then with the
        // final value after the motor stopped. Poll delayed, otherwise stale status can overwrite the new state.
        if (this.config.statusAfterCommand !== false && !['getStatus', 'getWeather', 'getTime', 'raw'].includes(normalizedCommand)) {
            this.scheduleStatusRefresh(code.substring(0, 6), normalizedCommand);
        }
    }


    startPeriodicStatusPolling() {
        // Alte Timer entfernen, damit beim Reconnect kein doppelter Poller läuft.
        this.stopPeriodicStatusPolling();
        if (this.config.periodicStatusPoll === false) return;
        const interval = Math.max(10000, Number(this.config.periodicStatusPollMs || DEFAULT_POLL_INTERVAL_MS));
        this.log.info(`Periodic DuoFern status polling enabled (${interval} ms).`);
        const run = () => {
            if (this.isUnloaded) return;
            void this.pollKnownDeviceStatuses('periodic');
        };
        // Kurz nach dem Start noch einmal abfragen, weil der globale Startstatus nicht bei allen Aktoren
        // dieselben Detailwerte liefert wie eine gezielte Abfrage des einzelnen Gerätes.
        this.periodicStatusPollTimer = this.setTimeout(() => {
            run();
            this.periodicStatusPollTimer = this.setInterval(run, interval);
        }, 8000);
    }

    stopPeriodicStatusPolling() {
        if (this.periodicStatusPollTimer) {
            this.clearTimeout(this.periodicStatusPollTimer);
            this.clearInterval(this.periodicStatusPollTimer);
            this.periodicStatusPollTimer = null;
        }
    }

    async pollKnownDeviceStatuses(reason = 'periodic') {
        if (this.periodicStatusPollActive) return;
        const codes = Array.from(this.knownCodes || [])
            .map(code => String(code).substring(0, 6).toUpperCase())
            .filter(code => code && this.isPollableDeviceCode(code));
        if (!codes.length) return;
        this.periodicStatusPollActive = true;
        this.periodicStatusPollCount += 1;
        await this.setStateSafe('info.periodicStatusPollCount', this.periodicStatusPollCount, true);
        await this.setStateSafe('info.lastPeriodicStatusPoll', JSON.stringify({ reason, devices: codes.length, time: new Date().toISOString() }), true);
        try {
            let delay = 0;
            for (const code of codes) {
                this.setTimeout(() => {
                    if (this.isUnloaded) return;
                    try {
                        this.enqueueSend(protocol.buildStatusRequest(code, 'getStatus'), { name: `${code} ${reason} getStatus`, lowPriority: true });
                    } catch (error) {
                        this.log.debug(`Could not poll status for ${code}: ${error.message}`);
                    }
                }, delay);
                delay += 450;
            }
            this.setTimeout(() => { this.periodicStatusPollActive = false; }, Math.max(1000, codes.length * 500));
        } catch (error) {
            this.periodicStatusPollActive = false;
            this.log.debug(`Periodic status poll failed: ${error.message}`);
        }
    }

    scheduleStatusRefresh(code, reason = 'command') {
        const deviceCode = protocol.normalizeDeviceCode(code).substring(0, 6).toUpperCase();
        this.clearStatusRefreshTimers(deviceCode);
        const movement = new Set(['up', 'down', 'position', 'toggle', 'dusk', 'dawn']);
        const delays = reason === 'stop'
            ? [1500, 5000, 12000]
            : movement.has(reason)
                ? [3000, 12000, 30000, 60000]
                : [1500, 5000, 12000];
        const timers = delays.map(delay => this.setTimeout(() => {
            if (this.isUnloaded) return;
            this.enqueueSend(protocol.buildStatusRequest(deviceCode, 'getStatus'), { name: `${deviceCode} delayed getStatus ${reason} +${delay}ms`, lowPriority: true });
        }, delay));
        this.statusRefreshTimers.set(deviceCode, timers);
    }

    clearStatusRefreshTimers(code) {
        const deviceCode = protocol.normalizeDeviceCode(code).substring(0, 6).toUpperCase();
        const timers = this.statusRefreshTimers.get(deviceCode) || [];
        for (const timer of timers) this.clearTimeout(timer);
        this.statusRefreshTimers.delete(deviceCode);
    }

    async updateLocalCommandState(code, command, arg) {
        const base = `devices.${code}`;
        await this.setStateSafe(`${base}.lastCommand`, `${command}${arg !== undefined && arg !== null && arg !== '' ? ` ${arg}` : ''}`, true);
        await this.setStateSafe(`${base}.lastCommandTime`, new Date().toISOString(), true);

        if (command === 'position') {
            const target = Number(arg);
            await this.ensureDecodedStateObject(`${base}.targetPosition`, target, 'targetPosition');
            await this.setStateSafe(`${base}.targetPosition`, target, true);
            const current = await this.getStateAsync(`${base}.position`).catch(() => null);
            const currentValue = Number(current && current.val);
            if (Number.isFinite(currentValue)) {
                // DuoFern: höherer Wert = weiter geschlossen. Bei invertierter Position umgekehrt.
                const closing = this.config.invertPosition ? target < currentValue : target > currentValue;
                await this.setStateSafe(`${base}.moving`, target === currentValue ? 'stop' : closing ? 'down' : 'up', true);
            } else {
                await this.setStateSafe(`${base}.moving`, 'moving', true);
            }
            await this.setStateSafe(`${base}.stateText`, `target position ${target}%`, true);
        } else if (command === 'level') {
            const target = Number(arg);
            await this.ensureDecodedStateObject(`${base}.targetLevel`, target, 'targetLevel');
            await this.setStateSafe(`${base}.targetLevel`, target, true);
            await this.setStateSafe(`${base}.stateText`, `target level ${target}%`, true);
        } else if (command === 'up' || command === 'down' || command === 'stop') {
            await this.setStateSafe(`${base}.moving`, command === 'stop' ? 'stop' : command, true);
            await this.setStateSafe(`${base}.stateText`, command, true);
        } else if (command === 'on' || command === 'off') {
            await this.setStateSafe(`${base}.state`, command === 'on', true);
            await this.setStateSafe(`${base}.stateText`, command, true);
        }

        const spec = protocol.commands && protocol.commands[command] ? protocol.commands[command] : null;
        if (spec && spec.cmd && spec.cmd.value && arg !== undefined && arg !== null && arg !== '') {
            const numeric = Number(arg);
            if (Number.isFinite(numeric)) {
                await this.ensureDecodedStateObject(`${base}.${command}`, numeric, command);
                await this.setStateSafe(`${base}.${command}`, numeric, true);
            }
        } else if (spec && spec.cmd && (spec.cmd.on !== undefined || spec.cmd.off !== undefined) && (arg === 'on' || arg === 'off')) {
            await this.ensureDecodedStateObject(`${base}.${command}`, arg === 'on', command);
            await this.setStateSafe(`${base}.${command}`, arg === 'on', true);
        }
    }

    async createDeviceObjects(rawCode, origin = 'auto') {
        const code = protocol.normalizeDeviceCode(rawCode).substring(0, 6).toUpperCase();
        if (!this.knownCodes.has(code)) {
            this.log.info(`Creating DuoFern device ${code} (${protocol.deviceClass(code)})`);
            this.knownCodes.add(code);
        }
        await this.setStateSafe('info.lastDeviceCode', code, true);
        await this.setStateSafe('info.deviceCount', this.knownCodes.size, true);

        const deviceName = `DuoFern ${code}`;
        await this.ensureChannelObject(`devices.${code}`, {
            name: { en: deviceName, de: deviceName }
        }, {
            code,
            deviceClass: protocol.deviceClass(code),
            origin
        });
        await this.ensureChannelObject(`devices.${code}.control`, {
            name: { en: 'Control', de: 'Steuerung' }
        }, {});

        const profileContext = await this.readCurrentDeviceProfileContext(code);
        const stateDefs = this.deviceStateDefinitions(code, profileContext);
        for (const [id, common] of Object.entries(stateDefs)) {
            await this.ensureStateObject(`devices.${code}.${id}`, common, { coreDeviceState: true });
        }
        await this.cleanupDeviceObjects(code, 'auto');
        this.deviceObjectsReady.add(code);
    }

    isRollerDevice(code) {
        const prefix = protocol.normalizeHex(code).substring(0, 2);
        return ['40', '41', '42', '47', '49', '4B', '4C', '61', '62', '70'].includes(prefix);
    }

    isSwitchDevice(code) {
        const prefix = protocol.normalizeHex(code).substring(0, 2);
        return ['43', '46', '71'].includes(prefix);
    }

    isDimmerDevice(code) {
        const prefix = protocol.normalizeHex(code).substring(0, 2);
        return ['48', '4A'].includes(prefix);
    }

    isGarageOrAwningDevice(code) {
        const prefix = protocol.normalizeHex(code).substring(0, 2);
        return ['4E', 'E1'].includes(prefix);
    }

    initialDeviceStateNames(code, readings = {}) {
        const names = new Set([
            'raw', 'lastSeen', 'lastDecoded', 'messageType', 'channel', 'payload', 'sourceCode', 'targetCode',
            'deviceClass', 'deviceProfile', 'command', 'lastCommand', 'lastCommandTime', 'statusGroup', 'statusPayload',
            'statusPayloadOffset', 'stateText'
        ]);
        for (const name of this.profileReadingNames(code, readings)) names.add(name);
        return names;
    }

    optionalDynamicStateNames() {
        const all = new Set([
            'position', 'rawPosition', 'targetPosition', 'level', 'targetLevel', 'state', 'moving', 'deviceProfile',
            'manualMode', 'timeAutomatic', 'sunAutomatic', 'duskAutomatic', 'dawnAutomatic', 'sunMode',
            'ventilatingPosition', 'ventilatingMode', 'sunPosition', 'runningTime', 'intermediateMode',
            'intermediateValue', 'slatPosition', 'stairwellFunction', 'stairwellTime', 'modeChange',
            'rainAutomatic', 'windAutomatic', 'rainMode', 'windMode', 'reversal', 'rainDirection',
            'windDirection', 'slatRunTime', 'tiltAfterMoveLevel', 'tiltInVentPos', 'defaultSlatPos',
            'tiltAfterStopDown', 'motorDeadTime', 'tiltInSunPos', 'blindsMode', 'blindsModeSwitch',
            'temperatureThreshold1', 'temperatureThreshold2', 'temperatureThreshold3', 'temperatureThreshold4',
            'desired-temp', 'desiredTemp', 'measured-temp', 'measured-temp2', 'output', 'manualOverride',
            'actTempLimit', 'sendingInterval', 'batteryPercent', 'valvePosition', 'forceResponse', 'obstacle',
            'obstacleDetection', 'block', 'blockDetection', 'lightCurtain', 'automaticClosing', 'openSpeed',
            '2000cycleAlarm', 'wicketDoor', 'backJump', '10minuteAlarm', 'light', 'version', 'up', 'down',
            'stop', 'toggle', 'getStatus', 'getWeather', 'getTime', 'getConfig', 'writeConfig', 'DCF',
            'interval', 'latitude', 'longitude', 'timezone', 'time', 'triggerDawn', 'triggerDusk',
            'triggerRain', 'triggerSun', 'triggerSunDirection', 'triggerSunHeight', 'triggerTemperature',
            'triggerWind', 'on', 'off', 'dusk', 'dawn', 'remotePair', 'remoteUnpair', 'reset', 'tempUp',
            'tempDown', 'windowContact', 'saveIntermediateOnStop'
        ]);
        if (protocol.commands) for (const name of Object.keys(protocol.commands)) all.add(name);
        if (protocol.statusCommands) for (const name of Object.keys(protocol.statusCommands)) all.add(name);
        return all;
    }

    async cleanupAllDeviceObjects(origin = 'auto') {
        let cleaned = 0;
        for (const code of this.knownCodes) {
            cleaned += await this.cleanupDeviceObjects(code, origin);
        }
        await this.setStateSafe('info.cleanedStateCount', cleaned, true);
        await this.setStateSafe('info.lastCleanup', JSON.stringify({ origin, cleaned, time: new Date().toISOString() }), true);
        return cleaned;
    }

    async cleanupDeviceObjects(rawCode, origin = 'auto') {
        const code = protocol.normalizeDeviceCode(rawCode).substring(0, 6).toUpperCase();
        const profileContext = await this.readCurrentDeviceProfileContext(code);
        const allowed = new Set(Object.keys(this.deviceStateDefinitions(code, profileContext)));
        const optional = this.optionalDynamicStateNames();
        let cleaned = 0;
        let inspected = 0;
        try {
            const list = await this.getObjectListAsync({
                startkey: `${this.namespace}.devices.${code}.`,
                endkey: `${this.namespace}.devices.${code}.香`
            });
            for (const row of list.rows || []) {
                const fullId = row.id || row.value?._id;
                if (!fullId || !fullId.startsWith(`${this.namespace}.devices.${code}.`)) continue;
                const rel = fullId.substring(this.namespace.length + 1);
                const suffix = rel.substring(`devices.${code}.`.length);
                if (suffix.includes('.')) continue;
                inspected += 1;
                if (!optional.has(suffix) || allowed.has(suffix)) continue;
                const obj = row.value || await this.getObjectAsync(rel).catch(() => null);
                if (obj && obj.native && obj.native.dynamicReading === true) continue;
                await this.delStateAsync(rel).catch(() => {});
                await this.delObjectAsync(rel).catch(() => {});
                this.ensuredObjects.delete(rel);
                cleaned += 1;
            }
        } catch (error) {
            this.log.debug(`Device state cleanup failed for ${code}: ${error.message}`);
        }
        if (cleaned) {
            await this.setStateSafe('info.lastCleanup', JSON.stringify({ origin, code, inspected, cleaned, time: new Date().toISOString() }), true);
            this.log.info(`Cleaned ${cleaned} unused state object(s) for DuoFern device ${code}.`);
        }
        return cleaned;
    }

    async readCurrentDeviceProfileContext(code) {
        const ctx = {};
        for (const name of ['blindsMode']) {
            const state = await this.getStateAsync(`devices.${code}.${name}`).catch(() => null);
            if (state && state.val !== undefined && state.val !== null) ctx[name] = state.val;
        }
        return ctx;
    }

    profileCommandNames(code, readings = {}) {
        const profile = protocol.deviceCommandProfile(code, readings);
        return profile.commands || [];
    }

    profileReadingNames(code, readings = {}) {
        return Array.from(protocol.deviceAllowedReadings(code, readings));
    }

    isProfileCommandAllowed(code, commandName, readings = {}) {
        if (commandName === 'raw') return true;
        return protocol.commandSupportedByDevice(code, commandName, readings);
    }

    isProfileReadingAllowed(code, reading, readings = {}) {
        return protocol.deviceAllowedReadings(code, readings).has(reading);
    }

    commonForProfileCommand(name) {
        const onOff = { on: 'on', off: 'off' };
        const upDown = { up: 'up', down: 'down' };
        const resetStates = { settings: 'settings', full: 'full' };
        const motorStates = { off: 'off', short: 'short', long: 'long' };
        const closingStates = { off: 'off', 30: '30', 60: '60', 90: '90', 120: '120', 150: '150', 180: '180', 210: '210', 240: '240' };
        const speedStates = { 11: '11', 15: '15', 19: '19' };
        const tempLimitStates = { 1: '1', 2: '2', 3: '3', 4: '4' };
        const boolSwitches = new Set([
            'manualMode', 'timeAutomatic', 'sunAutomatic', 'duskAutomatic', 'dawnAutomatic',
            'sunMode', 'ventilatingMode', 'windAutomatic', 'rainAutomatic', 'windMode', 'rainMode',
            'reversal', 'modeChange', 'stairwellFunction', 'intermediateMode', 'saveIntermediateOnStop',
            'tiltInSunPos', 'tiltInVentPos', 'tiltAfterMoveLevel', 'tiltAfterStopDown', 'blindsMode',
            '10minuteAlarm', '2000cycleAlarm', 'backJump', 'DCF', 'triggerRain', 'windowContact',
            'output', 'manualOverride'
        ]);
        const buttons = new Set([
            'up', 'down', 'stop', 'toggle', 'dusk', 'dawn', 'getStatus', 'getWeather', 'getTime',
            'getConfig', 'writeConfig', 'time', 'remotePair', 'remoteUnpair', 'tempUp', 'tempDown'
        ]);
        const numberDefs = {
            position: ['level.blind', 0, 100, '%'],
            rawPosition: ['value', 0, 100, '%'],
            targetPosition: ['level.blind', 0, 100, '%'],
            level: ['level.dimmer', 0, 100, '%'],
            targetLevel: ['level.dimmer', 0, 100, '%'],
            sunPosition: ['level.blind', 0, 100, '%'],
            ventilatingPosition: ['level.blind', 0, 100, '%'],
            intermediateValue: ['level', 0, 100, '%'],
            slatPosition: ['level', 0, 100, '%'],
            defaultSlatPos: ['level', 0, 100, '%'],
            runningTime: ['value', 0, 255, 's'],
            slatRunTime: ['value', 0, 50, 's'],
            stairwellTime: ['value', 0, 3200, 's'],
            sendingInterval: ['value.interval', 1, 60, 'min'],
            'desired-temp': ['level.temperature', 4, 30, '°C'],
            desiredTemp: ['level.temperature', 4, 30, '°C'],
            temperatureThreshold1: ['level.temperature', 4, 30, '°C'],
            temperatureThreshold2: ['level.temperature', 4, 30, '°C'],
            temperatureThreshold3: ['level.temperature', 4, 30, '°C'],
            temperatureThreshold4: ['level.temperature', 4, 30, '°C'],
            interval: ['value.interval', 0, 100, 'min'],
            latitude: ['value.gps.latitude', -90, 90, '°'],
            longitude: ['value.gps.longitude', -180, 180, '°'],
            timezone: ['value', -12, 14, 'h'],
            triggerDawn: ['value', 1, 100, ''],
            triggerDusk: ['value', 1, 100, ''],
            triggerTemperature: ['level.temperature', -40, 80, '°C'],
            triggerWind: ['value.speed.wind', 0, 200, 'km/h'],
            batteryPercent: ['value.battery', 0, 100, '%'],
            valvePosition: ['level', 0, 100, '%'],
            forceResponse: ['value', 0, 1, '']
        };
        const label = { en: name, de: name };
        if (buttons.has(name)) return { name: label, type: 'boolean', role: 'button', read: false, write: true, def: false };
        if (name === 'state') return { name: label, type: 'boolean', role: 'switch', read: true, write: true, def: false };
        if (name === 'on' || name === 'off') return { name: label, type: 'boolean', role: 'button', read: false, write: true, def: false };
        if (boolSwitches.has(name)) return { name: label, type: 'boolean', role: 'switch', read: true, write: true, def: false };
        if (name === 'rainDirection' || name === 'windDirection') return { name: label, type: 'string', role: 'state', read: true, write: true, states: upDown, def: 'down' };
        if (name === 'reset') return { name: label, type: 'string', role: 'state', read: true, write: true, states: resetStates, def: '' };
        if (name === 'motorDeadTime') return { name: label, type: 'string', role: 'state', read: true, write: true, states: motorStates, def: 'off' };
        if (name === 'automaticClosing') return { name: label, type: 'string', role: 'state', read: true, write: true, states: closingStates, def: 'off' };
        if (name === 'openSpeed') return { name: label, type: 'string', role: 'state', read: true, write: true, states: speedStates, def: '11' };
        if (name === 'actTempLimit') return { name: label, type: 'string', role: 'state', read: true, write: true, states: tempLimitStates, def: '1' };
        if (numberDefs[name]) {
            const [role, min, max, unit] = numberDefs[name];
            return { name: label, type: 'number', role, read: true, write: true, min, max, unit, def: min < 0 ? 0 : min };
        }
        return { name: label, type: 'string', role: 'text', read: true, write: true, def: '' };
    }

    deviceStateDefinitions(code, readings = {}) {
        const defs = {
            raw: { name: { en: 'Last raw telegram', de: 'Letztes Rohtelegramm' }, type: 'string', role: 'text', read: true, write: true, def: '' },
            lastSeen: { name: { en: 'Last seen', de: 'Zuletzt gesehen' }, type: 'string', role: 'date', read: true, write: false, def: '' },
            lastDecoded: { name: { en: 'Last decoded telegram JSON', de: 'Letztes dekodiertes Telegramm als JSON' }, type: 'string', role: 'json', read: true, write: false, def: '' },
            messageType: { name: { en: 'Message type', de: 'Nachrichtentyp' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            channel: { name: { en: 'Channel', de: 'Kanal' }, type: 'string', role: 'text', read: true, write: false, def: '01' },
            payload: { name: { en: 'Payload', de: 'Nutzdaten' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            sourceCode: { name: { en: 'Source code', de: 'Quellcode' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            targetCode: { name: { en: 'Target code', de: 'Zielcode' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            deviceClass: { name: { en: 'Device class', de: 'Geräteklasse' }, type: 'string', role: 'text', read: true, write: false, def: protocol.deviceClass(code) },
            deviceProfile: { name: { en: 'Device profile', de: 'Geräteprofil' }, type: 'string', role: 'text', read: true, write: false, def: protocol.deviceCommandProfile(code).profile },
            command: { name: { en: 'Text command', de: 'Textbefehl' }, type: 'string', role: 'text', read: true, write: true, def: '' },
            lastCommand: { name: { en: 'Last command', de: 'Letzter Befehl' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            lastCommandTime: { name: { en: 'Last command time', de: 'Zeit letzter Befehl' }, type: 'string', role: 'date', read: true, write: false, def: '' },
            statusGroup: { name: { en: 'Status group', de: 'Statusgruppe' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            statusPayload: { name: { en: 'Status payload', de: 'Status-Nutzdaten' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            statusPayloadOffset: { name: { en: 'Status payload offset', de: 'Status-Nutzdaten Offset' }, type: 'number', role: 'value', read: true, write: false, def: 0 },
            stateText: { name: { en: 'State text', de: 'Status Text' }, type: 'string', role: 'text', read: true, write: false, def: '' },
            position: { name: { en: 'Position / set position', de: 'Position / Position setzen' }, type: 'number', role: 'level.blind', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 },
            rawPosition: { name: { en: 'Raw DuoFern position', de: 'Rohposition DuoFern' }, type: 'number', role: 'value', read: true, write: false, min: 0, max: 100, unit: '%', def: 0 },
            targetPosition: { name: { en: 'Target position', de: 'Zielposition' }, type: 'number', role: 'level.blind', read: true, write: false, min: 0, max: 100, unit: '%', def: 0 },
            level: { name: { en: 'Level / set level', de: 'Level / Level setzen' }, type: 'number', role: 'level.dimmer', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 },
            targetLevel: { name: { en: 'Target level', de: 'Ziel-Level' }, type: 'number', role: 'level.dimmer', read: true, write: false, min: 0, max: 100, unit: '%', def: 0 },
            state: { name: { en: 'State / switch', de: 'Zustand / Schalten' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            moving: { name: { en: 'Moving', de: 'Bewegung' }, type: 'string', role: 'text', read: true, write: false, states: { up: 'up', down: 'down', stop: 'stop', moving: 'moving' }, def: 'stop' },
            up: { name: { en: 'Up', de: 'Hoch' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            down: { name: { en: 'Down', de: 'Runter' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            stop: { name: { en: 'Stop', de: 'Stopp' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            toggle: { name: { en: 'Toggle', de: 'Umschalten' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            getStatus: { name: { en: 'Get status', de: 'Status abfragen' }, type: 'boolean', role: 'button', read: false, write: true, def: false },
            manualMode: { name: { en: 'Manual mode', de: 'Manueller Modus' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            timeAutomatic: { name: { en: 'Time automatic', de: 'Zeitautomatik' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            sunAutomatic: { name: { en: 'Sun automatic', de: 'Sonnenautomatik' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            duskAutomatic: { name: { en: 'Dusk automatic', de: 'Abenddämmerungsautomatik' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            dawnAutomatic: { name: { en: 'Dawn automatic', de: 'Morgendämmerungsautomatik' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            sunMode: { name: { en: 'Sun mode', de: 'Sonnenmodus' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            ventilatingPosition: { name: { en: 'Ventilating position', de: 'Lüftungsposition' }, type: 'number', role: 'level.blind', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 },
            ventilatingMode: { name: { en: 'Ventilating mode', de: 'Lüftungsmodus' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            sunPosition: { name: { en: 'Sun position', de: 'Sonnenposition' }, type: 'number', role: 'level.blind', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 },
            runningTime: { name: { en: 'Running time', de: 'Laufzeit' }, type: 'number', role: 'value', read: true, write: true, min: 0, max: 150, unit: 's', def: 0 },
            intermediateMode: { name: { en: 'Intermediate mode', de: 'Zwischenwert-Modus' }, type: 'boolean', role: 'switch', read: true, write: true, def: false },
            intermediateValue: { name: { en: 'Intermediate value', de: 'Zwischenwert' }, type: 'number', role: 'level', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 },
            slatPosition: { name: { en: 'Slat position', de: 'Lamellenposition' }, type: 'number', role: 'level', read: true, write: true, min: 0, max: 100, unit: '%', def: 0 }
        };

        const profile = protocol.deviceCommandProfile(code, readings);
        for (const commandName of profile.commands || []) {
            if (!defs[commandName]) defs[commandName] = this.commonForProfileCommand(commandName);
        }

        const selected = {};
        for (const name of this.initialDeviceStateNames(code, readings)) {
            selected[name] = defs[name] || this.commonForProfileCommand(name) || this.commonForDecodedState(name, '', name);
        }

        const controls = {};
        for (const commandName of profile.commands || []) {
            if (['getStatus', 'up', 'down', 'stop', 'toggle', 'position', 'level', 'on', 'off', 'remotePair', 'remoteUnpair', 'getWeather', 'getTime'].includes(commandName)) {
                const baseDef = defs[commandName] || this.commonForProfileCommand(commandName);
                controls[`control.${commandName}`] = { ...baseDef, name: { en: `Control ${commandName}`, de: `Steuerung ${commandName}` } };
            }
        }
        return { ...selected, ...controls };
    }

    /**
     * Rechnet einen Prozentwert zwischen DuoFern-Darstellung (0 = offen) und
     * ioBroker-Konvention für level.blind (100 = offen) um.
     *
     * @param {any} value Prozentwert
     * @returns {number} invertierter Prozentwert
     */
    invertPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return value;
        }
        return 100 - Math.max(0, Math.min(100, num));
    }

    /**
     * Invertiert Positionswerte eines dekodierten Status, wenn die Option invertPosition aktiv ist.
     *
     * @param {object} decoded Ergebnis von protocol.decodeStatusTelegram
     */
    applyPositionInversionToReadings(decoded) {
        if (!this.config.invertPosition || !decoded || !decoded.readings) {
            return;
        }
        for (const name of INVERTIBLE_POSITION_READINGS) {
            if (typeof decoded.readings[name] === 'number') {
                decoded.readings[name] = this.invertPercent(decoded.readings[name]);
            }
        }
    }

    /**
     * Beantwortet sendTo-Anfragen aus der Admin-Oberfläche (z. B. Liste der seriellen Ports).
     *
     * @param {ioBroker.Message} obj Nachricht
     */
    async onMessage(obj) {
        if (!obj || !obj.command) {
            return;
        }
        if (obj.command === 'listPorts') {
            let result = [];
            try {
                if (SerialPort && typeof SerialPort.list === 'function') {
                    const ports = await SerialPort.list();
                    // /dev/serial/by-id/... ist stabiler als /dev/ttyUSBx und wird deshalb bevorzugt angezeigt.
                    result = ports.map(port => {
                        const path = port.pnpId && process.platform === 'linux' ? `/dev/serial/by-id/${port.pnpId}` : port.path;
                        const info = [port.manufacturer, port.serialNumber].filter(Boolean).join(' ');
                        return { value: path, label: info ? `${path} (${info})` : path };
                    });
                }
            } catch (error) {
                this.log.warn(`Could not list serial ports: ${error.message}`);
            }
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, result, obj.callback);
            }
            return;
        }
        if (obj.callback) {
            this.sendTo(obj.from, obj.command, { error: `Unknown command ${obj.command}` }, obj.callback);
        }
    }

    async onUnload(callback) {
        try {
            this.isUnloaded = true;
            if (this.flushTimer) {
                this.clearTimeout(this.flushTimer);
                this.flushTimer = null;
            }
            if (this.reconnectTimer) {
                this.clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (this.pairTimer) {
                this.clearTimeout(this.pairTimer);
                this.pairTimer = null;
            }
            if (this.unpairTimer) {
                this.clearTimeout(this.unpairTimer);
                this.unpairTimer = null;
            }
            this.clearCurrentTimer();
            this.stopPeriodicStatusPolling();
            for (const timers of this.statusRefreshTimers.values()) {
                for (const timer of timers) this.clearTimeout(timer);
            }
            this.statusRefreshTimers.clear();
            this.externalRefreshLast.clear();
            this.rejectReadAnswer(new Error('Adapter unloaded'));
            await this.closeSerialPort();
            await this.setStateSafe('info.connection', false, true);
            await this.setStateSafe('info.dongleSerial', this.dongleSerial, true);
            await this.setStateSafe('status.state', 'stopped', true);
            callback();
        } catch (error) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new Duofernstick(options);
} else {
    new Duofernstick();
}
