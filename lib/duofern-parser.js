"use strict";

const { getDeviceType, getKnownDeviceTypeCodes, sanitizeDeviceId } = require("./device-types");

function normaliseHex(input) {
    if (Buffer.isBuffer(input)) {
        return input.toString("hex").toUpperCase();
    }
    return String(input || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function byteAt(hex, idx) {
    const part = hex.substr(idx * 2, 2);
    return part.length === 2 ? parseInt(part, 16) : undefined;
}

function bit(value, from, to = from) {
    if (typeof value !== "number") return undefined;
    const width = to - from + 1;
    const mask = ((1 << width) - 1) << from;
    return (value & mask) >> from;
}

function onOff(v) {
    if (v === undefined) return undefined;
    return v === 1 || v === 0xFD || v === true;
}

function invertPercent(v) {
    if (typeof v !== "number" || Number.isNaN(v)) return undefined;
    const pct = Math.max(0, Math.min(100, v));
    return 100 - pct;
}

class DuoFernParser {
    constructor(options = {}) {
        this.frameHexLength = options.frameHexLength || 44; // FHEM handles 22-byte frames.
    }

    /**
     * Extract full DuoFern frames from a raw serial buffer.
     * The USB stick usually delivers binary frames. Some debug/test inputs are ASCII hex.
     */
    extractFrames(buffer) {
        if (!buffer || buffer.length === 0) return { frames: [], rest: Buffer.alloc(0) };

        const ascii = buffer.toString("utf8");
        if (/^[\s0-9a-fA-F]+$/.test(ascii) && /[\r\n\s]/.test(ascii)) {
            const parts = ascii.split(/[\r\n]+/).map(normaliseHex).filter(Boolean);
            return { frames: parts, rest: Buffer.alloc(0) };
        }

        const frameBytes = this.frameHexLength / 2;
        const frames = [];
        let offset = 0;
        while (buffer.length - offset >= frameBytes) {
            frames.push(buffer.subarray(offset, offset + frameBytes).toString("hex").toUpperCase());
            offset += frameBytes;
        }
        return { frames, rest: buffer.subarray(offset) };
    }

    parse(input) {
        const hex = normaliseHex(input);
        if (hex.length < 12) return null;

        const source = hex.substr(4, 6) || hex.substr(0, 6);
        const destination = hex.substr(10, 6) || undefined;
        const deviceType = this.inferDeviceType(hex);
        const typeInfo = getDeviceType(deviceType);
        const payload = this.extractPayload(hex);
        const states = this.decodeStates(hex, payload, deviceType, typeInfo.category);

        return {
            id: sanitizeDeviceId(source),
            serial: source,
            source,
            destination,
            deviceType,
            deviceTypeName: typeInfo.name,
            category: typeInfo.category,
            raw: hex,
            states
        };
    }

    inferDeviceType(hex) {
        // Common FHEM-style device id position is not always the same for every telegram.
        // We therefore check multiple safe candidates and prefer known DuoFern device ids.
        const candidates = [byteAt(hex, 8), byteAt(hex, 9), byteAt(hex, 10), byteAt(hex, 11), byteAt(hex, 12)]
            .filter(v => typeof v === "number")
            .map(v => v.toString(16).toUpperCase().padStart(2, "0"));
        for (const c of candidates) {
            if (getKnownDeviceTypeCodes().includes(c)) return c;
        }
        return candidates[0] || "00";
    }

    extractPayload(hex) {
        // Last 10 bytes contain the value/status area for most DuoFern data frames.
        return hex.length >= 20 ? hex.slice(-20) : hex;
    }

    decodeStates(hex, payload, deviceType, category) {
        const states = {};
        const b = [];
        for (let i = 0; i < payload.length; i += 2) b.push(parseInt(payload.substr(i, 2), 16));

        if (category === "blinds" || category === "venetianBlinds" || category === "shutter" || ["40","41","42","47","49","61","62","70","4B","4C"].includes(deviceType)) {
            this.decodeShutterLike(states, b, deviceType);
            if (category === "venetianBlinds") this.decodeVenetianLike(states, b);
        } else if (category === "gate") {
            this.decodeShutterLike(states, b, deviceType);
            this.decodeGateLike(states, b);
        } else if (category === "actuator" || category === "switch" || category === "switch2" || category === "dimmer") {
            this.decodeSwitchLike(states, b);
        } else if (category === "thermostat") {
            this.decodeThermostatLike(states, b);
        } else if (category === "sensor") {
            this.decodeSensorLike(states, b, deviceType);
        } else if (category === "remote") {
            this.decodeRemoteLike(states, b);
        }

        return dropUndefined(states);
    }

    decodeShutterLike(states, b, deviceType) {
        // FHEM maps position from payload byte 7 bit 0..6 inverted for many shutter devices.
        // Rohrmotor-Aktor/Steuerung often sends partial status telegrams; therefore every field remains optional.
        const possiblePosition = b[7];
        if (typeof possiblePosition === "number" && possiblePosition <= 100) {
            states.position = invertPercent(bit(possiblePosition, 0, 6));
        }

        const flags0 = b[0];
        const flags2 = b[2];
        const flags3 = b[3];
        const flags6 = b[6];

        const movingRaw = bit(flags0, 0);
        if (movingRaw !== undefined) {
            states.moving = movingRaw === 1;
            if (!states.moving) states.direction = "stop";
        }

        const dirBit = bit(flags2, 2);
        if (dirBit !== undefined && states.moving) states.direction = dirBit ? "down" : "up";

        const rt = deviceType === "42" || deviceType === "47" || deviceType === "49" ? b[5] : b[6];
        if (typeof rt === "number" && rt > 0 && rt <= 3200) states.runningTime = rt;

        // Common optional flags. Only set them when the bit location is available.
        const manual = bit(flags3, 5);
        if (manual !== undefined) states.manualMode = onOff(manual);
        const timeAuto = bit(flags3, 0);
        if (timeAuto !== undefined) states.timeAutomatic = onOff(timeAuto);
        const sunAuto = bit(flags3, 2);
        if (sunAuto !== undefined) states.sunAutomatic = onOff(sunAuto);
        const duskAuto = bit(flags3, 1);
        if (duskAuto !== undefined) states.duskAutomatic = onOff(duskAuto);
        const dawnAuto = bit(flags3, 6);
        if (dawnAuto !== undefined) states.dawnAutomatic = onOff(dawnAuto);

        if (typeof flags6 === "number") {
            const intVal = bit(flags6, 0, 6);
            if (intVal !== undefined && intVal <= 100) states.intermediateValue = intVal;
            const intMode = bit(flags6, 7);
            if (intMode !== undefined) states.intermediateMode = onOff(intMode);
        }
    }

    decodeVenetianLike(states, b) {
        // Venetian-blind specific telegrams are not full snapshots either. Decode only safe values.
        if (typeof b[4] === "number" && b[4] <= 100) states.slatPosition = b[4];
        if (typeof b[5] === "number" && b[5] > 0 && b[5] <= 3200) states.slatRunTime = b[5];
        const flags6 = b[6];
        if (typeof flags6 === "number") {
            const defaultSlatPos = bit(flags6, 0, 6);
            if (defaultSlatPos !== undefined && defaultSlatPos <= 100) states.defaultSlatPos = defaultSlatPos;
            const blindsMode = bit(flags6, 7);
            if (blindsMode !== undefined) states.blindsMode = onOff(blindsMode);
        }
    }

    decodeGateLike(states, b) {
        const flags1 = b[1];
        const flags2 = b[2];
        if (bit(flags1, 0) !== undefined) states.obstacle = bit(flags1, 0) === 1;
        if (bit(flags1, 1) !== undefined) states.block = bit(flags1, 1) === 1;
        if (bit(flags1, 2) !== undefined) states.lightCurtain = bit(flags1, 2) === 1;
        if (bit(flags1, 3) !== undefined) states.wicketDoor = bit(flags1, 3) === 1;
        if (bit(flags2, 0) !== undefined) states.automaticClosing = onOff(bit(flags2, 0));
        if (bit(flags2, 1) !== undefined) states.backJump = onOff(bit(flags2, 1));
        if (bit(flags2, 2) !== undefined) states["2000cycleAlarm"] = bit(flags2, 2) === 1;
        if (bit(flags2, 3) !== undefined) states["10minuteAlarm"] = bit(flags2, 3) === 1;
        if (bit(flags2, 4) !== undefined) states.light = bit(flags2, 4) === 1;
    }

    decodeSwitchLike(states, b) {
        const level = b[7];
        if (typeof level === "number" && level <= 100) states.level = level;
        const on = bit(b[0], 0);
        if (on !== undefined) states.state = onOff(on);
        const manual = bit(b[3], 5);
        if (manual !== undefined) states.manualMode = onOff(manual);
        const timeAuto = bit(b[3], 0);
        if (timeAuto !== undefined) states.timeAutomatic = onOff(timeAuto);
        const sunAuto = bit(b[3], 2);
        if (sunAuto !== undefined) states.sunAutomatic = onOff(sunAuto);
        const duskAuto = bit(b[3], 1);
        if (duskAuto !== undefined) states.duskAutomatic = onOff(duskAuto);
        const dawnAuto = bit(b[3], 6);
        if (dawnAuto !== undefined) states.dawnAutomatic = onOff(dawnAuto);
    }

    decodeThermostatLike(states, b) {
        if (typeof b[0] === "number") states["desired-temp"] = Math.round((b[0] / 2) * 10) / 10;
        if (typeof b[2] === "number") states["measured-temp"] = Math.round((b[2] / 2) * 10) / 10;
        if (typeof b[7] === "number" && b[7] <= 100) states.batteryPercent = b[7];
        if (typeof b[6] === "number" && b[6] <= 100) states.valvePosition = b[6];
    }

    decodeSensorLike(states, b, deviceType) {
        if (typeof b[1] === "number") states.temperature = Math.round(((b[1] - 50) / 2) * 10) / 10;
        if (typeof b[2] === "number") states.wind = b[2];
        const rain = bit(b[3], 0);
        if (rain !== undefined) states.rain = rain === 1;
        if (typeof b[4] === "number") states.sun = b[4];
        if (typeof b[7] === "number" && b[7] <= 100) states.batteryPercent = b[7];
        const contact = bit(b[0], 0);
        if (deviceType === "65" && contact !== undefined) states.motion = contact === 1;
        if (deviceType === "AB" && contact !== undefined) states.smokeAlarm = contact === 1;
        if (deviceType === "AC" && contact !== undefined) states.contact = contact === 1;
    }

    decodeRemoteLike(states, b) {
        if (typeof b[7] === "number" && b[7] <= 100) states.batteryPercent = b[7];
    }
}

function dropUndefined(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) {
        if (value !== undefined && value !== null && !Number.isNaN(value)) out[key] = value;
    }
    return out;
}

module.exports = DuoFernParser;
module.exports.normaliseHex = normaliseHex;
module.exports.dropUndefined = dropUndefined;
