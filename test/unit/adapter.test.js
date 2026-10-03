'use strict';
/**
 * Simulationstest für main.js: ioBroker-Adapter-Core und der DuoFern USB-Stick werden gemockt.
 * So lassen sich Startsequenz, Empfang, Befehlswarteschlange und Objektverwaltung ohne Hardware prüfen.
 */
const assert = require('node:assert');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const ACK = '81000000000000000000000000000000000000000000';
const DEVICE = '406B2D';
const DONGLE = '6F1A6F';

function statusFrame(code, positionByte) {
    // 0F FF 0F 21 ... Position im 16-Bit-Fenster an Byte 7 (siehe protocol.test.js)
    const pos = positionByte.toString(16).padStart(2, '0').toUpperCase();
    return `0FFF0F2100000000000000${pos}000000${code}FFFFFF01`;
}

// ---------------------------------------------------------------- Mock: serialport
class FakeStick extends EventEmitter {
    constructor(opts) {
        super();
        this.path = opts.path;
        this.isOpen = false;
        FakeStick.last = this;
        this.tx = [];
        this.silent = FakeStick.silent;
        this.positions = new Map([[DEVICE, 30]]);
    }
    open(cb) {
        this.isOpen = true;
        setImmediate(() => cb(null));
    }
    close(cb) {
        this.isOpen = false;
        setImmediate(() => {
            this.emit('close');
            cb && cb();
        });
    }
    drain(cb) {
        setImmediate(() => cb(null));
    }
    write(buf, cb) {
        const hex = Buffer.from(buf).toString('hex').toUpperCase();
        this.tx.push(hex);
        setImmediate(() => cb(null));
        if (this.silent || hex === ACK) {
            return;
        }
        // Der Stick antwortet auf jedes Telegramm mit einer 81er-Quittung.
        setTimeout(() => this.receive(`81000000${'0'.repeat(28)}${hex.substring(30, 38)}`.substring(0, 44).padEnd(44, '0')), 2);
        // Statusabfrage -> Statustelegramm des Aktors
        const m = hex.match(/^0DFF0F40[0-9A-F]{28}([0-9A-F]{6})01$/);
        if (m && this.positions.has(m[1])) {
            setTimeout(() => this.receive(statusFrame(m[1], this.positions.get(m[1]))), 5);
        }
    }
    receive(hex, split = false) {
        const buf = Buffer.from(hex, 'hex');
        if (!split) {
            this.emit('data', buf);
            return;
        }
        // In mehreren kleinen Stücken liefern, wie es serielle Treiber oft tun.
        for (let i = 0; i < buf.length; i += 5) {
            this.emit('data', buf.subarray(i, i + 5));
        }
    }
    static async list() {
        return [{ path: '/dev/ttyUSB0', pnpId: 'usb-Rademacher_DuoFern_USB-Stick_WR0-if00-port0', manufacturer: 'Rademacher' }];
    }
}

// ---------------------------------------------------------------- Mock: adapter-core
class FakeAdapter extends EventEmitter {
    constructor(options) {
        super();
        this.name = options.name;
        this.namespace = `${options.name}.0`;
        this.config = { ...FakeAdapter.nextConfig };
        this.objects = new Map();
        this.states = new Map();
        this.objectWrites = 0;
        this.sent = [];
        this.timers = new Set();
        this.logs = [];
        const log = level => msg => this.logs.push(`${level}: ${msg}`);
        this.log = { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), silly: log('silly') };
        FakeAdapter.last = this;
    }
    full(id) {
        return id.startsWith(`${this.namespace}.`) ? id : `${this.namespace}.${id}`;
    }
    async setStateAsync(id, state) {
        this.states.set(this.full(id), { ...state });
    }
    async getStateAsync(id) {
        return this.states.get(this.full(id)) || null;
    }
    async getObjectAsync(id) {
        return this.objects.get(this.full(id)) || null;
    }
    async setObjectNotExistsAsync(id, obj) {
        if (!this.objects.has(this.full(id))) {
            this.objectWrites++;
            this.objects.set(this.full(id), JSON.parse(JSON.stringify(obj)));
        }
    }
    async extendObjectAsync(id, obj) {
        this.objectWrites++;
        const old = this.objects.get(this.full(id)) || {};
        this.objects.set(this.full(id), { ...old, ...obj, common: { ...(old.common || {}), ...(obj.common || {}) } });
    }
    async getObjectListAsync({ startkey, endkey }) {
        const rows = [];
        for (const [id, value] of this.objects) {
            if (id >= startkey && id <= endkey) {
                rows.push({ id, value });
            }
        }
        return { rows };
    }
    async delStateAsync(id) {
        this.states.delete(this.full(id));
    }
    async delObjectAsync(id) {
        this.objects.delete(this.full(id));
    }
    subscribeStates() {}
    sendTo(to, command, message, callback) {
        this.sent.push({ to, command, message });
        if (typeof callback === 'function') {
            callback(message);
        }
    }
    setTimeout(fn, ms) {
        const t = setTimeout(() => {
            this.timers.delete(t);
            fn();
        }, ms);
        this.timers.add(t);
        return t;
    }
    clearTimeout(t) {
        clearTimeout(t);
        this.timers.delete(t);
    }
    setInterval(fn, ms) {
        const t = setInterval(fn, ms);
        this.timers.add(t);
        return t;
    }
    clearInterval(t) {
        clearInterval(t);
        this.timers.delete(t);
    }
    async unload() {
        await new Promise(resolve => this.onUnload(resolve));
        for (const t of this.timers) {
            clearTimeout(t);
            clearInterval(t);
        }
    }
    // Benutzer schreibt einen State (ack=false)
    async userSet(id, val) {
        await this.onStateChange(this.full(id), { val, ack: false });
    }
    val(id) {
        const s = this.states.get(this.full(id));
        return s ? s.val : undefined;
    }
}

// ---------------------------------------------------------------- Modul-Umleitung
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@iobroker/adapter-core') {
        return { Adapter: FakeAdapter };
    }
    if (request === 'serialport') {
        return { SerialPort: FakeStick };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const mainPath = path.join(__dirname, '..', '..', 'main.js');
delete require.cache[mainPath];
const createAdapter = require(mainPath);
Module._load = originalLoad;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function start(config = {}) {
    FakeAdapter.nextConfig = {
        port: '/dev/ttyUSB0',
        baudRate: 115200,
        dongleSerial: DONGLE,
        deviceCodes: DEVICE,
        autoCreate: true,
        ackIncoming: true,
        initOnStart: true,
        statusOnStart: false,
        statusAfterCommand: false,
        periodicStatusPoll: false,
        externalActivityPollAll: false,
        readAnswerTimeoutMs: 500,
        commandTimeoutMs: 1000,
        flushPartialMs: 500,
        ...config,
    };
    const adapter = createAdapter({});
    await adapter.onReady();
    // Warten bis Init durch ist
    for (let i = 0; i < 200 && !['Initialized', 'Init fail'].includes(adapter.val('status.state')); i++) {
        await sleep(10);
    }
    return adapter;
}

describe('main.js (simulated stick)', function () {
    this.timeout(15000);
    let adapter;

    afterEach(async () => {
        if (adapter) {
            await adapter.unload();
            adapter = null;
        }
        FakeStick.silent = false;
    });

    it('initializes the stick with the configured radio code and sets info.connection', async () => {
        adapter = await start();
        const tx = FakeStick.last.tx;
        assert.strictEqual(adapter.val('status.state'), 'Initialized');
        assert.strictEqual(adapter.val('info.connection'), true);
        assert.strictEqual(tx[0], '01000000000000000000000000000000000000000000', 'INIT1 first');
        assert.ok(tx.includes(`0A${DONGLE}000100000000000000000000000000000000`), 'SetDongle with configured code');
        assert.ok(tx.some(f => f.startsWith(`0300${DEVICE}`)), 'SetPairs for configured device');
    });

    it('keeps info.connection false when the stick does not answer the init', async () => {
        FakeStick.silent = true;
        adapter = await start({ readAnswerTimeoutMs: 500 });
        // 4 Versuche à 500 ms
        for (let i = 0; i < 400 && adapter.val('status.state') !== 'Init fail'; i++) {
            await sleep(10);
        }
        assert.strictEqual(adapter.val('status.state'), 'Init fail');
        assert.strictEqual(adapter.val('info.connection'), false);
    });

    it('no longer replaces the radio code based on a hard-coded USB path', async () => {
        adapter = await start({ port: '/dev/serial/by-id/usb-Rademacher_DuoFern_USB-Stick_WR029A2I-if00-port0', dongleSerial: '' });
        assert.notStrictEqual(adapter.val('info.dongleSerial'), '6F1A6F');
        assert.strictEqual(adapter.val('status.state'), 'error', 'missing radio code must be reported');
    });

    it('decodes a status frame received in small chunks and stores the position', async () => {
        adapter = await start();
        FakeStick.last.receive(statusFrame(DEVICE, 37), true);
        await sleep(100);
        assert.strictEqual(adapter.val(`devices.${DEVICE}.position`), 37);
        assert.strictEqual(adapter.val(`devices.${DEVICE}.rawPosition`), 37);
    });

    it('processes back-to-back frames strictly in order', async () => {
        adapter = await start();
        const stick = FakeStick.last;
        stick.receive(statusFrame(DEVICE, 10) + statusFrame(DEVICE, 20) + statusFrame(DEVICE, 30), true);
        await sleep(150);
        assert.strictEqual(adapter.val(`devices.${DEVICE}.position`), 30, 'last frame must win');
    });

    it('does not rewrite device objects for every received telegram', async () => {
        adapter = await start();
        FakeStick.last.receive(statusFrame(DEVICE, 37));
        await sleep(100);
        const writesAfterFirst = adapter.objectWrites;
        for (let i = 0; i < 10; i++) {
            FakeStick.last.receive(statusFrame(DEVICE, 40 + i));
            await sleep(20);
        }
        await sleep(100);
        assert.strictEqual(adapter.val(`devices.${DEVICE}.position`), 49);
        assert.strictEqual(adapter.objectWrites - writesAfterFirst, 0, 'no object writes for repeated telegrams');
    });

    it('sends position commands and maps them to the DuoFern value when invertPosition is enabled', async () => {
        adapter = await start({ invertPosition: true });
        FakeStick.last.tx.length = 0;
        await adapter.userSet(`devices.${DEVICE}.position`, 70);
        await sleep(100);
        const frame = FakeStick.last.tx.find(f => f.startsWith('0D010707'));
        assert.ok(frame, 'position frame sent');
        assert.strictEqual(frame.substring(10, 12), '1E', '70 % open = DuoFern 30 (0x1E)');
        assert.ok(frame.includes(`${DONGLE}${DEVICE}`), 'dongle code inserted');

        FakeStick.last.receive(statusFrame(DEVICE, 30));
        await sleep(100);
        assert.strictEqual(adapter.val(`devices.${DEVICE}.position`), 70, 'reading inverted to ioBroker convention');
        assert.strictEqual(adapter.val(`devices.${DEVICE}.rawPosition`), 30, 'rawPosition shows the DuoFern value');
    });

    it('sends position values unchanged by default', async () => {
        adapter = await start();
        FakeStick.last.tx.length = 0;
        await adapter.userSet(`devices.${DEVICE}.position`, 70);
        await sleep(100);
        const frame = FakeStick.last.tx.find(f => f.startsWith('0D010707'));
        assert.strictEqual(frame.substring(10, 12), '46');
    });

    it('puts user commands ahead of queued status polls and skips duplicates', async () => {
        adapter = await start();
        FakeStick.silent = true;
        FakeStick.last.silent = true;
        const req = '0DFF0F400000000000000000000000000000' + DEVICE + '01';
        // erstes Element blockiert die Queue (wartet auf ACK)
        adapter.enqueueSend(req, { name: 'blocking', lowPriority: true });
        adapter.enqueueSend('0DFF0F40000000000000000000000000000040AAAA01', { name: 'poll A', lowPriority: true });
        adapter.enqueueSend('0DFF0F40000000000000000000000000000040AAAA01', { name: 'poll A again', lowPriority: true });
        adapter.enqueueSend('0DFF0F40000000000000000000000000000040BBBB01', { name: 'poll B', lowPriority: true });
        adapter.enqueueSend(`0D0107010000000000000000000000ZZZZZZ${DEVICE}00`, { name: 'up' });
        const names = adapter.sendQueue.map(i => i.name);
        assert.deepStrictEqual(names, ['up', 'poll A', 'poll B']);
    });

    it('limits the number of queued status polls', async () => {
        adapter = await start();
        FakeStick.last.silent = true;
        adapter.enqueueSend('0DFF0F40000000000000000000000000000040FFFF01', { name: 'blocking', lowPriority: true });
        for (let i = 0; i < 80; i++) {
            const code = (0x400000 + i).toString(16).toUpperCase();
            adapter.enqueueSend(`0DFF0F400000000000000000000000000000${code}01`, { name: `poll ${i}`, lowPriority: true });
        }
        assert.strictEqual(adapter.sendQueue.length, 50);
        adapter.enqueueSend(`0D0107010000000000000000000000ZZZZZZ${DEVICE}00`, { name: 'up' });
        assert.strictEqual(adapter.sendQueue[0].name, 'up', 'user commands are always accepted');
    });

    it('lists serial ports for the admin UI', async () => {
        adapter = await start();
        const answers = [];
        await adapter.onMessage({ command: 'listPorts', from: 'system.adapter.admin.0', callback: msg => answers.push(msg) });
        const reply = adapter.sent.find(s => s.command === 'listPorts');
        assert.ok(reply, 'answer sent');
        assert.strictEqual(reply.message[0].value, '/dev/serial/by-id/usb-Rademacher_DuoFern_USB-Stick_WR0-if00-port0');
    });

    it('clears all timers on unload', async () => {
        adapter = await start({ statusAfterCommand: true, periodicStatusPoll: true });
        await adapter.userSet(`devices.${DEVICE}.up`, true);
        await sleep(50);
        await adapter.unload();
        assert.strictEqual(adapter.val('status.state'), 'stopped');
        assert.strictEqual(adapter.val('info.connection'), false);
        adapter = null;
    });
});
