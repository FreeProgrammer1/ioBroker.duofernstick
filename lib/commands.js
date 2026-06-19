"use strict";

function cleanHex(value) {
    return String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function hexByte(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Invalid byte value ${value}`);
    return Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, "0");
}

function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Invalid percent value ${value}`);
    return Math.max(0, Math.min(100, Math.round(n)));
}

const STICK_COMMANDS = Object.freeze({
    // Compact command templates derived from the public command names. They are kept in one
    // place so they can be adapted easily if a live hardware trace shows a device-specific deviation.
    init1: "0D0000000000000000000000",
    init2: "0D0100000000000000000000",
    init3: "0D0200000000000000000000",
    ack: "0D0300000000000000000000",
    pair: "0D0400000000000000000000",
    unpair: "0D0500000000000000000000",
    statusBroadcast: "0D0600000000000000000000"
});

const DEVICE_COMMANDS = Object.freeze({
    up: "07010000000000000000",
    stop: "07020000000000000000",
    down: "07030000000000000000",
    toggle: "07040000000000000000",
    statusRequest: "07050000000000000000",
    remotePair: "07060000000000000000",
    position: "0801{value}00000000000000",
    targetPosition: "0801{value}00000000000000",
    runningTime: "0803{value}00000000000000",
    manualModeOn: "080700FD000000000000",
    manualModeOff: "080700FE000000000000",
    timeAutomaticOn: "080400FD000000000000",
    timeAutomaticOff: "080400FE000000000000",
    sunAutomaticOn: "080500FD000000000000",
    sunAutomaticOff: "080500FE000000000000",
    duskAutomaticOn: "080600FD000000000000",
    duskAutomaticOff: "080600FE000000000000",
    dawnAutomaticOn: "080800FD000000000000",
    dawnAutomaticOff: "080800FE000000000000",
    ventilatingModeOn: "080900FD000000000000",
    ventilatingModeOff: "080900FE000000000000",
    sunModeOn: "080A00FD000000000000",
    sunModeOff: "080A00FE000000000000",
    windAutomaticOn: "080B00FD000000000000",
    windAutomaticOff: "080B00FE000000000000",
    rainAutomaticOn: "080C00FD000000000000",
    rainAutomaticOff: "080C00FE000000000000",
    windModeOn: "080D00FD000000000000",
    windModeOff: "080D00FE000000000000",
    rainModeOn: "080E00FD000000000000",
    rainModeOff: "080E00FE000000000000",
    ventilatingPosition: "0810{value}00000000000000",
    sunPosition: "0811{value}00000000000000",
    slatPosition: "0812{value}00000000000000"
});

function buildDeviceCommand(stateKey, value) {
    if (["up", "stop", "down", "toggle", "getStatus", "remotePair", "on", "off"].includes(stateKey)) {
        if (stateKey === "getStatus") return DEVICE_COMMANDS.statusRequest;
        if (stateKey === "remotePair") return DEVICE_COMMANDS.remotePair;
        if (stateKey === "on" || stateKey === "off") return DEVICE_COMMANDS.toggle;
        return DEVICE_COMMANDS[stateKey];
    }
    if (stateKey === "command") {
        const cmd = String(value || "").trim().toLowerCase();
        if (["up", "stop", "down"].includes(cmd)) return DEVICE_COMMANDS[cmd];
        return cleanHex(value);
    }
    if (["position", "targetPosition", "ventilatingPosition", "sunPosition", "slatPosition", "level"].includes(stateKey)) {
        const template = DEVICE_COMMANDS[stateKey] || (stateKey === "level" ? DEVICE_COMMANDS.position : DEVICE_COMMANDS.position);
        // DuoFern uses inverted shutter position for many devices: ioBroker 0=open, 100=closed.
        const pct = stateKey === "level" ? clampPercent(value) : 100 - clampPercent(value);
        return template.replace("{value}", hexByte(pct));
    }
    if (stateKey === "runningTime") return DEVICE_COMMANDS.runningTime.replace("{value}", hexByte(value));
    if (stateKey === "manualMode") return value ? DEVICE_COMMANDS.manualModeOn : DEVICE_COMMANDS.manualModeOff;
    if (stateKey === "timeAutomatic") return value ? DEVICE_COMMANDS.timeAutomaticOn : DEVICE_COMMANDS.timeAutomaticOff;
    if (stateKey === "sunAutomatic") return value ? DEVICE_COMMANDS.sunAutomaticOn : DEVICE_COMMANDS.sunAutomaticOff;
    if (stateKey === "duskAutomatic") return value ? DEVICE_COMMANDS.duskAutomaticOn : DEVICE_COMMANDS.duskAutomaticOff;
    if (stateKey === "dawnAutomatic") return value ? DEVICE_COMMANDS.dawnAutomaticOn : DEVICE_COMMANDS.dawnAutomaticOff;
    if (stateKey === "ventilatingMode") return value ? DEVICE_COMMANDS.ventilatingModeOn : DEVICE_COMMANDS.ventilatingModeOff;
    if (stateKey === "sunMode") return value ? DEVICE_COMMANDS.sunModeOn : DEVICE_COMMANDS.sunModeOff;
    if (stateKey === "windAutomatic") return value ? DEVICE_COMMANDS.windAutomaticOn : DEVICE_COMMANDS.windAutomaticOff;
    if (stateKey === "rainAutomatic") return value ? DEVICE_COMMANDS.rainAutomaticOn : DEVICE_COMMANDS.rainAutomaticOff;
    if (stateKey === "windMode") return value ? DEVICE_COMMANDS.windModeOn : DEVICE_COMMANDS.windModeOff;
    if (stateKey === "rainMode") return value ? DEVICE_COMMANDS.rainModeOn : DEVICE_COMMANDS.rainModeOff;
    return "";
}

module.exports = {
    STICK_COMMANDS,
    DEVICE_COMMANDS,
    buildDeviceCommand,
    cleanHex,
    hexByte,
    clampPercent
};
