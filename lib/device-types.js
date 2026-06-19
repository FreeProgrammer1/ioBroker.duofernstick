"use strict";

/**
 * Central DuoFern device/capability catalogue.
 */
const DEVICE_TYPES = Object.freeze({
    "40": { name: "RolloTron Standard", category: "blinds" },
    "41": { name: "RolloTron Comfort Slave", category: "blinds" },
    "42": { name: "Rohrmotor-Aktor", category: "venetianBlinds" },
    "43": { name: "Universalaktor", category: "actuator", channels: ["01", "02"] },
    "46": { name: "Steckdosenaktor", category: "actuator" },
    "47": { name: "Rohrmotor Steuerung", category: "blinds", format: "23a" },
    "48": { name: "Dimmaktor", category: "dimmer" },
    "49": { name: "Rohrmotor", category: "blinds" },
    "4A": { name: "Dimmer", category: "dimmer" },
    "4B": { name: "Connect-Aktor", category: "venetianBlinds" },
    "4C": { name: "Troll Basis", category: "venetianBlinds" },
    "4E": { name: "SX5", category: "gate", format: "24a" },
    "61": { name: "RolloTron Comfort Master", category: "blinds" },
    "62": { name: "Unspecified device type (62)", category: "blinds" },
    "65": { name: "Bewegungsmelder", category: "sensor" },
    "69": { name: "Umweltsensor", category: "sensor", format: "23a" },
    "70": { name: "Troll Comfort DuoFern", category: "venetianBlinds" },
    "71": { name: "Troll Comfort DuoFern Light", category: "actuator" },
    "73": { name: "Raumthermostat", category: "thermostat" },
    "74": { name: "Wandtaster 6fach", category: "remote" },
    "A0": { name: "Handsender 6G48", category: "remote" },
    "A1": { name: "Handsender 1G48", category: "remote" },
    "A2": { name: "Handsender 6G1", category: "remote" },
    "A3": { name: "Handsender 1G1", category: "remote" },
    "A4": { name: "Wandtaster", category: "remote" },
    "A5": { name: "Sonnensensor", category: "sensor" },
    "A7": { name: "Funksender UP", category: "remote" },
    "A8": { name: "HomeTimer", category: "remote" },
    "A9": { name: "Sonnen-/Windsensor", category: "sensor" },
    "AA": { name: "Markisenwaechter", category: "sensor" },
    "AB": { name: "Rauchmelder", category: "sensor" },
    "AC": { name: "Fenster-Tuer-Kontakt", category: "sensor" },
    "AD": { name: "Wandtaster 6fach Bat", category: "remote" },
    "AF": { name: "Sonnensensor", category: "sensor" },
    "E0": { name: "Handzentrale", category: "remote" },
    "E1": { name: "Heizkoerperantrieb", category: "thermostat" }
});

const STATE_DEFINITIONS = Object.freeze({
    // Generic metadata
    lastSeen: { name: "Last seen", type: "string", role: "date", read: true, write: false },
    rawTelegram: { name: "Last raw telegram", type: "string", role: "text", read: true, write: false },
    deviceType: { name: "Device type", type: "string", role: "info.type", read: true, write: false },
    deviceTypeName: { name: "Device type name", type: "string", role: "info.name", read: true, write: false },
    serial: { name: "DuoFern serial", type: "string", role: "info.serial", read: true, write: false },
    command: { name: "Command", type: "string", role: "text", read: false, write: true },

    // Command buttons
    up: { name: "Up", type: "boolean", role: "button", read: false, write: true, def: false },
    down: { name: "Down", type: "boolean", role: "button", read: false, write: true, def: false },
    stop: { name: "Stop", type: "boolean", role: "button", read: false, write: true, def: false },
    toggle: { name: "Toggle", type: "boolean", role: "button", read: false, write: true, def: false },
    on: { name: "On", type: "boolean", role: "button", read: false, write: true, def: false },
    off: { name: "Off", type: "boolean", role: "button", read: false, write: true, def: false },
    getStatus: { name: "Get status", type: "boolean", role: "button", read: false, write: true, def: false },
    remotePair: { name: "Remote pair", type: "boolean", role: "button", read: false, write: true, def: false },

    // Blind / shutter / venetian blind states
    position: { name: "Position", type: "number", role: "level.blind", read: true, write: true, min: 0, max: 100, unit: "%" },
    targetPosition: { name: "Target position", type: "number", role: "level.blind", read: true, write: true, min: 0, max: 100, unit: "%" },
    moving: { name: "Moving", type: "boolean", role: "indicator.working", read: true, write: false },
    direction: { name: "Direction", type: "string", role: "state", read: true, write: false, states: { up: "up", down: "down", stop: "stop", unknown: "unknown" } },
    runningTime: { name: "Running time", type: "number", role: "value.interval", read: true, write: true, min: 0, max: 3200, unit: "s" },
    manualMode: { name: "Manual mode", type: "boolean", role: "switch", read: true, write: true },
    timeAutomatic: { name: "Time automatic", type: "boolean", role: "switch", read: true, write: true },
    sunAutomatic: { name: "Sun automatic", type: "boolean", role: "switch", read: true, write: true },
    duskAutomatic: { name: "Dusk automatic", type: "boolean", role: "switch", read: true, write: true },
    dawnAutomatic: { name: "Dawn automatic", type: "boolean", role: "switch", read: true, write: true },
    sunMode: { name: "Sun mode", type: "boolean", role: "switch", read: true, write: true },
    rainAutomatic: { name: "Rain automatic", type: "boolean", role: "switch", read: true, write: true },
    windAutomatic: { name: "Wind automatic", type: "boolean", role: "switch", read: true, write: true },
    windMode: { name: "Wind mode", type: "boolean", role: "switch", read: true, write: true },
    rainMode: { name: "Rain mode", type: "boolean", role: "switch", read: true, write: true },
    reversal: { name: "Reversal", type: "boolean", role: "indicator", read: true, write: false },
    rainDirection: { name: "Rain direction", type: "string", role: "state", read: true, write: false, states: { up: "up", down: "down" } },
    windDirection: { name: "Wind direction", type: "string", role: "state", read: true, write: false, states: { up: "up", down: "down" } },
    sunPosition: { name: "Sun position", type: "number", role: "level.blind", read: true, write: true, min: 0, max: 100, unit: "%" },
    ventilatingPosition: { name: "Ventilating position", type: "number", role: "level.blind", read: true, write: true, min: 0, max: 100, unit: "%" },
    ventilatingMode: { name: "Ventilating mode", type: "boolean", role: "switch", read: true, write: true },

    // Venetian blind / slat specific states
    slatRunTime: { name: "Slat run time", type: "number", role: "value.interval", read: true, write: false, unit: "s" },
    tiltAfterMoveLevel: { name: "Tilt after move level", type: "boolean", role: "switch", read: true, write: true },
    tiltInVentPos: { name: "Tilt in ventilating position", type: "boolean", role: "switch", read: true, write: true },
    defaultSlatPos: { name: "Default slat position", type: "number", role: "level", read: true, write: true, min: 0, max: 100, unit: "%" },
    tiltAfterStopDown: { name: "Tilt after stop down", type: "boolean", role: "switch", read: true, write: true },
    motorDeadTime: { name: "Motor dead time", type: "string", role: "state", read: true, write: false },
    tiltInSunPos: { name: "Tilt in sun position", type: "boolean", role: "switch", read: true, write: true },
    slatPosition: { name: "Slat position", type: "number", role: "level", read: true, write: true, min: 0, max: 100, unit: "%" },
    blindsMode: { name: "Blinds mode", type: "boolean", role: "switch", read: true, write: true },
    intermediateValue: { name: "Intermediate value", type: "number", role: "level.blind", read: true, write: true, min: 0, max: 100, unit: "%" },
    intermediateMode: { name: "Intermediate mode", type: "boolean", role: "switch", read: true, write: true },

    // Switch / dimmer / actuator states
    state: { name: "State", type: "boolean", role: "switch", read: true, write: true },
    level: { name: "Level", type: "number", role: "level.dimmer", read: true, write: true, min: 0, max: 100, unit: "%" },

    // Gate states
    obstacle: { name: "Obstacle", type: "boolean", role: "indicator.alarm", read: true, write: false },
    block: { name: "Block", type: "boolean", role: "indicator.alarm", read: true, write: false },
    lightCurtain: { name: "Light curtain", type: "boolean", role: "indicator.alarm", read: true, write: false },
    automaticClosing: { name: "Automatic closing", type: "boolean", role: "switch", read: true, write: true },
    openSpeed: { name: "Open speed", type: "string", role: "state", read: true, write: true },
    "2000cycleAlarm": { name: "2000 cycle alarm", type: "boolean", role: "indicator.alarm", read: true, write: false },
    wicketDoor: { name: "Wicket door", type: "boolean", role: "indicator", read: true, write: false },
    backJump: { name: "Back jump", type: "boolean", role: "switch", read: true, write: true },
    "10minuteAlarm": { name: "10 minute alarm", type: "boolean", role: "indicator.alarm", read: true, write: false },
    light: { name: "Light", type: "boolean", role: "indicator", read: true, write: false },

    // Thermostat / sensor states
    "desired-temp": { name: "Desired temperature", type: "number", role: "level.temperature", read: true, write: true, unit: "°C" },
    "measured-temp": { name: "Measured temperature", type: "number", role: "value.temperature", read: true, write: false, unit: "°C" },
    temperature: { name: "Temperature", type: "number", role: "value.temperature", read: true, write: false, unit: "°C" },
    batteryPercent: { name: "Battery", type: "number", role: "value.battery", read: true, write: false, min: 0, max: 100, unit: "%" },
    valvePosition: { name: "Valve position", type: "number", role: "level.valve", read: true, write: false, min: 0, max: 100, unit: "%" },
    wind: { name: "Wind", type: "number", role: "value.speed.wind", read: true, write: false },
    rain: { name: "Rain", type: "boolean", role: "indicator", read: true, write: false },
    sun: { name: "Sun", type: "number", role: "value.brightness", read: true, write: false },
    motion: { name: "Motion", type: "boolean", role: "sensor.motion", read: true, write: false },
    smokeAlarm: { name: "Smoke alarm", type: "boolean", role: "indicator.alarm.fire", read: true, write: false },
    contact: { name: "Contact", type: "boolean", role: "sensor.window", read: true, write: false }
});

const CATEGORY_CAPABILITIES = Object.freeze({
    blinds: [
        "up", "down", "stop", "toggle", "position", "moving", "direction",
        "sunAutomatic", "timeAutomatic", "duskAutomatic", "dawnAutomatic", "manualMode",
        "runningTime", "sunPosition", "ventilatingPosition", "ventilatingMode", "sunMode",
        "rainAutomatic", "windAutomatic", "reversal", "rainDirection", "windDirection",
        "windMode", "rainMode"
    ],
    venetianBlinds: [
        "up", "down", "stop", "toggle", "position", "moving", "direction",
        "sunAutomatic", "timeAutomatic", "duskAutomatic", "dawnAutomatic", "manualMode",
        "runningTime", "sunPosition", "ventilatingPosition", "ventilatingMode", "sunMode",
        "rainAutomatic", "windAutomatic", "reversal", "rainDirection", "windDirection",
        "windMode", "rainMode", "slatRunTime", "tiltAfterMoveLevel", "tiltInVentPos",
        "defaultSlatPos", "tiltAfterStopDown", "motorDeadTime", "tiltInSunPos",
        "slatPosition", "blindsMode", "intermediateValue", "intermediateMode"
    ],
    gate: [
        "up", "down", "stop", "position", "moving", "direction", "manualMode", "timeAutomatic",
        "ventilatingMode", "ventilatingPosition", "obstacle", "block", "lightCurtain",
        "automaticClosing", "openSpeed", "2000cycleAlarm", "wicketDoor", "backJump",
        "10minuteAlarm", "light"
    ],
    actuator: [
        "on", "off", "toggle", "state", "level", "dawnAutomatic", "duskAutomatic",
        "manualMode", "sunAutomatic", "timeAutomatic", "sunMode"
    ],
    dimmer: [
        "level", "on", "off", "toggle", "state", "dawnAutomatic", "duskAutomatic", "manualMode",
        "sunAutomatic", "timeAutomatic", "sunMode", "runningTime"
    ],
    sensor: [],
    thermostat: ["desired-temp", "measured-temp", "batteryPercent", "valvePosition", "manualMode", "timeAutomatic"],
    remote: [],
    unknown: ["up", "down", "stop", "toggle", "position", "moving", "direction"]
});

const COMMON_STATES = Object.freeze(["serial", "deviceType", "deviceTypeName", "lastSeen", "rawTelegram", "command", "getStatus", "remotePair"]);

function sanitizeDeviceId(id) {
    return String(id || "unknown").replace(/[^A-Za-z0-9_-]/g, "_");
}

function normaliseType(type) {
    return String(type || "").toUpperCase().padStart(2, "0");
}

function getDeviceType(type) {
    const key = normaliseType(type);
    return DEVICE_TYPES[key] || { name: `Unknown ${key || "device"}`, category: "unknown", capabilities: [] };
}

function getKnownDeviceTypeCodes() {
    return Object.keys(DEVICE_TYPES);
}

function getStateDefinition(key) {
    return STATE_DEFINITIONS[key] || { name: key, type: "mixed", role: "state", read: true, write: false };
}

function getSupportedStates(type, observedKeys = []) {
    const device = getDeviceType(type);
    const categoryKeys = CATEGORY_CAPABILITIES[device.category] || [];
    const keys = new Set([...COMMON_STATES, ...categoryKeys, ...observedKeys]);
    return [...keys].filter(Boolean);
}

module.exports = {
    DEVICE_TYPES,
    STATE_DEFINITIONS,
    CATEGORY_CAPABILITIES,
    COMMON_STATES,
    getDeviceType,
    getKnownDeviceTypeCodes,
    getStateDefinition,
    getSupportedStates,
    normaliseType,
    sanitizeDeviceId
};
