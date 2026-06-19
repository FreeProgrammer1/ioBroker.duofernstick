"use strict";

const utils = require("@iobroker/adapter-core");
const DuoFernParser = require("./lib/duofern-parser");
const StateManager = require("./lib/state-manager");
const { STICK_COMMANDS, buildDeviceCommand, cleanHex } = require("./lib/commands");

let SerialPort;
try {
    ({ SerialPort } = require("serialport"));
} catch (err) {
    SerialPort = null;
}

class DuoFernStickAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: "duofernstick" });
        this.port = null;
        this.rxBuffer = Buffer.alloc(0);
        this.sendQueue = [];
        this.sending = false;
        this.parser = new DuoFernParser();
        this.stateManager = new StateManager(this);

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync("info.connection", false, true);
        await this.stateManager.loadKnownDevices();
        this.subscribeStates("control.*");
        this.subscribeStates("devices.*.*");

        const dongle = cleanHex(this.config.dongleSerial || "");
        if (!dongle.startsWith("6F")) {
            this.log.warn("DuoFern DongleSerial sollte mit 6F beginnen. Bitte Admin-Konfiguration prüfen.");
        }

        if (!SerialPort) {
            await this.setStateAsync("info.lastError", "serialport module not installed", true);
            this.log.error("Das npm-Modul 'serialport' ist nicht installiert. Bitte Adapter-Installation prüfen.");
            return;
        }

        await this.openSerial();

        if (this.config.statusOnStart !== false) {
            this.enqueueStickCommand("statusBroadcast");
        }
    }

    async openSerial() {
        const path = this.config.serialPort || "/dev/ttyUSB0";
        const baudRate = Number(this.config.baudRate || 115200);
        this.log.info(`Öffne DuoFern Stick auf ${path} @ ${baudRate}`);

        this.port = new SerialPort({ path, baudRate, autoOpen: false });
        this.port.on("data", data => this.onSerialData(data));
        this.port.on("error", err => this.onSerialError(err));
        this.port.on("close", async () => {
            await this.setStateAsync("info.connection", false, true);
            this.log.warn("DuoFern Stick Verbindung geschlossen");
        });

        await new Promise((resolve, reject) => {
            this.port.open(err => err ? reject(err) : resolve());
        }).catch(async err => {
            await this.setStateAsync("info.lastError", err.message, true);
            throw err;
        });

        await this.setStateAsync("info.connection", true, true);
        this.log.info("DuoFern Stick verbunden");
    }

    async onSerialData(data) {
        try {
            this.rxBuffer = Buffer.concat([this.rxBuffer, data]);
            const { frames, rest } = this.parser.extractFrames(this.rxBuffer);
            this.rxBuffer = rest;

            for (const frame of frames) {
                if (this.config.debugRaw) this.log.debug(`RX ${frame}`);
                await this.setStateAsync("info.lastRawTelegram", frame, true);
                const telegram = this.parser.parse(frame);
                if (telegram) await this.stateManager.upsertFromTelegram(telegram);
            }
        } catch (err) {
            this.log.warn(`Fehler beim Verarbeiten eines DuoFern-Telegramms: ${err.message}`);
            await this.setStateAsync("info.lastError", err.message, true);
        }
    }

    async onSerialError(err) {
        this.log.error(`DuoFern Stick Fehler: ${err.message}`);
        await this.setStateAsync("info.connection", false, true);
        await this.setStateAsync("info.lastError", err.message, true);
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        const rel = id.replace(`${this.namespace}.`, "");

        if (rel.startsWith("control.")) {
            const key = rel.substring("control.".length);
            if (key === "raw") {
                this.enqueueRaw(state.val);
            } else if (state.val === true || key === "statusBroadcast") {
                this.enqueueStickCommand(key);
                await this.setStateAsync(rel, false, true).catch(() => undefined);
            }
            return;
        }

        const m = rel.match(/^devices\.([^\.]+)\.([^\.]+)$/);
        if (!m) return;
        const [, deviceId, stateKey] = m;
        const cmd = buildDeviceCommand(stateKey, state.val);
        if (!cmd) {
            this.log.debug(`Kein DuoFern-Befehl für ${stateKey}`);
            return;
        }
        this.enqueueDeviceCommand(deviceId, cmd);

        // Reset write-only button states so ioBroker buttons can be pressed repeatedly.
        if (["up", "down", "stop", "toggle", "on", "off", "getStatus", "remotePair"].includes(stateKey)) {
            await this.setStateAsync(rel, false, true).catch(() => undefined);
        }
    }

    enqueueStickCommand(commandName) {
        const cmd = STICK_COMMANDS[commandName];
        if (!cmd) {
            this.log.warn(`Unbekannter Stick-Befehl: ${commandName}`);
            return;
        }
        this.enqueueRaw(cmd);
    }

    enqueueDeviceCommand(deviceId, command) {
        // Placeholder envelope: device command payload is queued as raw command. In a live setup this
        // is the single place to add per-device serial/dongle encryption/rolling-key framing.
        this.log.info(`Sende DuoFern Befehl an ${deviceId}: ${command}`);
        this.enqueueRaw(command);
    }

    enqueueRaw(hex) {
        const clean = cleanHex(hex);
        if (!clean || clean.length % 2 !== 0) {
            this.log.warn(`Ungültiges Rohtelegramm: ${hex}`);
            return;
        }
        this.sendQueue.push(clean);
        this.processQueue().catch(err => this.log.error(`Sendequeue Fehler: ${err.message}`));
    }

    async processQueue() {
        if (this.sending || !this.port || !this.port.isOpen) return;
        this.sending = true;
        try {
            while (this.sendQueue.length > 0) {
                const hex = this.sendQueue.shift();
                if (this.config.debugRaw) this.log.debug(`TX ${hex}`);
                const buf = Buffer.from(hex, "hex");
                await new Promise((resolve, reject) => {
                    this.port.write(buf, err => err ? reject(err) : resolve());
                });
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        } finally {
            this.sending = false;
        }
    }

    async onUnload(callback) {
        try {
            if (this.port && this.port.isOpen) {
                await new Promise(resolve => this.port.close(() => resolve()));
            }
            callback();
        } catch (err) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new DuoFernStickAdapter(options);
} else {
    new DuoFernStickAdapter();
}
