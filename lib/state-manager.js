"use strict";

const { getDeviceType, getStateDefinition, getSupportedStates, sanitizeDeviceId } = require("./device-types");

class StateManager {
    constructor(adapter) {
        this.adapter = adapter;
        this.knownDevices = new Map();
    }

    async loadKnownDevices() {
        try {
            const objects = await this.adapter.getAdapterObjectsAsync();
            for (const id of Object.keys(objects || {})) {
                const m = id.match(/\.devices\.([^\.]+)$/);
                if (m && objects[id].type === "device") this.knownDevices.set(m[1], true);
            }
        } catch (err) {
            this.adapter.log.warn(`Could not load known devices: ${err.message}`);
        }
    }

    async upsertFromTelegram(telegram) {
        if (!telegram || !telegram.id) return;
        const deviceId = sanitizeDeviceId(telegram.id);
        const states = compactObject(telegram.states || {});

        // Core rule for 0.1.20: incoming telegrams are patches, never full snapshots.
        // Missing keys must not reset existing ioBroker states to 0/false/empty.
        const observedKeys = Object.keys(states);
        const supported = getSupportedStates(telegram.deviceType, observedKeys);

        await this.ensureDevice(deviceId, telegram, supported);

        const base = `devices.${deviceId}`;
        const meta = {
            serial: telegram.serial || telegram.source || deviceId,
            deviceType: telegram.deviceType || "00",
            deviceTypeName: telegram.deviceTypeName || getDeviceType(telegram.deviceType).name,
            lastSeen: new Date().toISOString(),
            rawTelegram: telegram.raw || ""
        };

        for (const [key, value] of Object.entries(meta)) {
            await this.setStateIfChanged(`${base}.${key}`, value, true);
        }
        for (const [key, value] of Object.entries(states)) {
            if (!this.shouldAcceptValue(key, value)) continue;
            await this.ensureState(`${base}.${key}`, key, telegram.deviceType);
            await this.setStateIfChanged(`${base}.${key}`, value, true);
        }
    }

    async ensureDevice(deviceId, telegram, stateKeys) {
        const typeInfo = getDeviceType(telegram.deviceType);
        const base = `devices.${deviceId}`;
        if (!this.knownDevices.has(deviceId)) {
            await this.adapter.setObjectNotExistsAsync(base, {
                type: "device",
                common: { name: telegram.deviceTypeName || typeInfo.name || deviceId },
                native: {
                    serial: telegram.serial || telegram.source || deviceId,
                    deviceType: telegram.deviceType || "00",
                    deviceTypeName: telegram.deviceTypeName || typeInfo.name,
                    category: telegram.category || typeInfo.category
                }
            });
            this.knownDevices.set(deviceId, true);
        }

        for (const key of stateKeys) {
            await this.ensureState(`${base}.${key}`, key, telegram.deviceType);
        }
    }

    async ensureState(id, key, deviceType) {
        const def = getStateDefinition(key);
        const common = {
            name: def.name || key,
            type: def.type || "mixed",
            role: def.role || "state",
            read: def.read !== false,
            write: def.write === true
        };
        for (const p of ["min", "max", "unit", "states", "def"]) {
            if (def[p] !== undefined) common[p] = def[p];
        }
        await this.adapter.setObjectNotExistsAsync(id, {
            type: "state",
            common,
            native: { key, deviceType }
        });
    }

    shouldAcceptValue(key, value) {
        if (value === undefined || value === null) return false;
        if (typeof value === "number" && Number.isNaN(value)) return false;
        if (key === "position" || key === "targetPosition" || key === "level") {
            return typeof value === "number" && value >= 0 && value <= 100;
        }
        if (key === "runningTime") {
            // Critical fix: do not overwrite a valid runtime with 0 from a partial/empty status frame.
            return typeof value === "number" && value > 0 && value <= 3200;
        }
        return true;
    }

    async setStateIfChanged(id, value, ack = true) {
        try {
            const oldState = await this.adapter.getStateAsync(id);
            if (oldState && valuesEqual(oldState.val, value) && oldState.ack === ack) return;
            await this.adapter.setStateAsync(id, { val: value, ack });
        } catch (err) {
            this.adapter.log.warn(`Could not set ${id}: ${err.message}`);
        }
    }
}

function compactObject(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) {
        if (value !== undefined && value !== null && !(typeof value === "number" && Number.isNaN(value))) {
            out[key] = value;
        }
    }
    return out;
}

function valuesEqual(a, b) {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.000001;
    return a === b;
}

module.exports = StateManager;
module.exports.compactObject = compactObject;
module.exports.valuesEqual = valuesEqual;
