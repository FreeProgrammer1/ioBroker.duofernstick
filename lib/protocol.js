'use strict';
/**
 * DuoFern protocol helpers.
 *
 * This module keeps telegram templates, command builders, device profiles
 * and status parsers in one place. Device support should be extended through
 * the profile tables instead of duplicating protocol logic in main.js.
 */
const HEX44 = /^[0-9A-F]{44}$/i;
const HEX6 = /^[0-9A-F]{6}$/i;
const HEX6OR8 = /^[0-9A-F]{6}([0-9A-F]{2})?$/i;

const constants = Object.freeze({
    duoInit1: '01000000000000000000000000000000000000000000',
    duoInit2: '0E000000000000000000000000000000000000000000',
    duoSetDongle: '0Azzzzzz000100000000000000000000000000000000',
    duoInit3: '14140000000000000000000000000000000000000000',
    duoSetPairs: '03nnyyyyyy0000000000000000000000000000000000',
    duoInitEnd: '10010000000000000000000000000000000000000000',
    duoACK: '81000000000000000000000000000000000000000000',
    duoStatusBroadcast: '0DFF0F400000000000000000000000000000FFFFFF01',
    duoStartPair: '04000000000000000000000000000000000000000000',
    duoStopPair: '05000000000000000000000000000000000000000000',
    duoStartUnpair: '07000000000000000000000000000000000000000000',
    duoStopUnpair: '08000000000000000000000000000000000000000000',
    duoRemotePairStick: '0D0106010000000000000000000000000000yyyyyy00',
    duoDeviceStatusRequest: '0DFFnn400000000000000000000000000000yyyyyy01',
    duoCommand: '0Dccnnnnnnnnnnnnnnnnnnnn000000zzzzzzyyyyyy00',
    duoCommand2: '0Dccnnnnnnnnnnnnnnnnnnnn000000000000yyyyyy00',
    duoCommand3: '0Dccnnnnnnnnnnnnnnnnnnnn000000000000yyyyyy01',
    duoWeatherConfig: '0D001B400000000000000000000000000000yyyyyy00',
    duoWeatherWriteConfig: '0DFF1Brrnnnnnnnnnnnnnnnnnnnn00000000yyyyyy00',
    duoSetTime: '0D0110800001mmmmmmmmnnnnnn0000000000yyyyyy00'
});

const statusCommands = Object.freeze({
    getStatus: '0F',
    getWeather: '13',
    getTime: '10'
});

// Befehlstabelle für häufig genutzte DuoFern-Aktoren.
const commands = Object.freeze({
    remotePair: { cmd: { noArg: '06010000000000000000' }, secondFrame: true },
    remoteUnpair: { cmd: { noArg: '06020000000000000000' } },
    up: { cmd: { noArg: '0701tt00000000000000' } },
    stop: { cmd: { noArg: '07020000000000000000' } },
    down: { cmd: { noArg: '0703tt00000000000000' } },
    position: { cmd: { value: '0707ttnn000000000000' }, min: 0, max: 100 },
    level: { cmd: { value: '0707ttnn000000000000' }, min: 0, max: 100 },
    sunMode: { cmd: { on: '070801FF000000000000', off: '070A0100000000000000' } },
    dusk: { cmd: { noArg: '070901FF000000000000' } },
    reversal: { cmd: { noArg: '070C0000000000000000' } },
    modeChange: { cmd: { noArg: '070C0000000000000000' } },
    windMode: { cmd: { on: '070D01FF000000000000', off: '070E0100000000000000' } },
    rainMode: { cmd: { on: '071101FF000000000000', off: '07120100000000000000' } },
    dawn: { cmd: { noArg: '071301FF000000000000' } },
    rainDirection: { cmd: { down: '071400FD000000000000', up: '071400FE000000000000' } },
    windDirection: { cmd: { down: '071500FD000000000000', up: '071500FE000000000000' } },
    tempUp: { cmd: { noArg: '0718tt00000000000000' } },
    tempDown: { cmd: { noArg: '0719tt00000000000000' } },
    toggle: { cmd: { noArg: '071A0000000000000000' } },
    slatPosition: { cmd: { value: '071B00000000nn000000' }, min: 0, max: 100 },
    desiredTemp: { wireName: 'desired-temp', cmd: { value: '0722tt0000wwww000000' }, min: -40, max: 80, multi: 10, offset: 400 },
    'desired-temp': { cmd: { value: '0722tt0000wwww000000' }, min: -40, max: 80, multi: 10, offset: 400 },
    sunAutomatic: { cmd: { on: '080100FD000000000000', off: '080100FE000000000000' } },
    sunPosition: { cmd: { value: '080100nn000000000000' }, min: 0, max: 100, invert: 100 },
    ventilatingMode: { cmd: { on: '080200FD000000000000', off: '080200FE000000000000' } },
    ventilatingPosition: { cmd: { value: '080200nn000000000000' }, min: 0, max: 100, invert: 100 },
    intermediateMode: { cmd: { on: '080200FD000000000000', off: '080200FE000000000000' } },
    intermediateValue: { cmd: { value: '080200nn000000000000' }, min: 0, max: 100 },
    saveIntermediateOnStop: { cmd: { on: '080200FB000000000000', off: '080200FC000000000000' } },
    runningTime: { cmd: { value: '0803nn00000000000000' }, min: 0, max: 150 },
    timeAutomatic: { cmd: { on: '080400FD000000000000', off: '080400FE000000000000' } },
    duskAutomatic: { cmd: { on: '080500FD000000000000', off: '080500FE000000000000' } },
    manualMode: { cmd: { on: '080600FD000000000000', off: '080600FE000000000000' } },
    windAutomatic: { cmd: { on: '080700FD000000000000', off: '080700FE000000000000' } },
    rainAutomatic: { cmd: { on: '080800FD000000000000', off: '080800FE000000000000' } },
    dawnAutomatic: { cmd: { on: '080900FD000000000000', off: '080900FE000000000000' } },
    tiltInSunPos: { cmd: { on: '080C00FD000000000000', off: '080C00FE000000000000' } },
    tiltInVentPos: { cmd: { on: '080D00FD000000000000', off: '080D00FE000000000000' } },
    tiltAfterMoveLevel: { cmd: { on: '080E00FD000000000000', off: '080E00FE000000000000' } },
    tiltAfterStopDown: { cmd: { on: '080F00FD000000000000', off: '080F00FE000000000000' } },
    defaultSlatPos: { cmd: { value: '0810nn00000000000000' }, min: 0, max: 100 },
    blindsMode: { cmd: { on: '081100FD000000000000', off: '081100FE000000000000' } },
    slatRunTime: { cmd: { value: '0812nn00000000000000' }, min: 0, max: 50 },
    motorDeadTime: { cmd: { off: '08130000000000000000', short: '08130100000000000000', long: '08130200000000000000' } },
    stairwellFunction: { cmd: { on: '081400FD000000000000', off: '081400FE000000000000' } },
    stairwellTime: { cmd: { value: '08140000wwww00000000' }, min: 0, max: 3200, multi: 10 },
    reset: { cmd: { settings: '0815CB00000000000000', full: '0815CC00000000000000' } },
    '10minuteAlarm': { cmd: { on: '081700FD000000000000', off: '081700FE000000000000' } },
    automaticClosing: { cmd: { off: '08180000000000000000', 30: '08180001000000000000', 60: '08180002000000000000', 90: '08180003000000000000', 120: '08180004000000000000', 150: '08180005000000000000', 180: '08180006000000000000', 210: '08180007000000000000', 240: '08180008000000000000' } },
    '2000cycleAlarm': { cmd: { on: '081900FD000000000000', off: '081900FE000000000000' } },
    openSpeed: { cmd: { 11: '081A0001000000000000', 15: '081A0002000000000000', 19: '081A0003000000000000' } },
    backJump: { cmd: { on: '081B00FD000000000000', off: '081B00FE000000000000' } },
    temperatureThreshold1: { cmd: { value: '081E00000001nn000000' }, min: -40, max: 80, multi: 2, offset: 80 },
    temperatureThreshold2: { cmd: { value: '081E0000000200nn0000' }, min: -40, max: 80, multi: 2, offset: 80 },
    temperatureThreshold3: { cmd: { value: '081E000000040000nn00' }, min: -40, max: 80, multi: 2, offset: 80 },
    temperatureThreshold4: { cmd: { value: '081E00000008000000nn' }, min: -40, max: 80, multi: 2, offset: 80 },
    actTempLimit: { cmd: { 1: '081Ett00001000000000', 2: '081Ett00003000000000', 3: '081Ett00005000000000', 4: '081Ett00007000000000' } },
    on: { cmd: { noArg: '0E03tt00000000000000' } },
    off: { cmd: { noArg: '0E02tt00000000000000' } }
});

const devicePrefixes = Object.freeze({
    40: 'rollerShutter', 41: 'rollerShutter', 42: 'troll', 43: 'switchActor', 46: 'switchActor',
    47: 'troll', 48: 'dimmer', 49: 'rolloTube', '4A': 'dimmer', '4B': 'troll', '4C': 'troll',
    '4E': 'sx5', 61: 'rollerShutter', 62: 'rollerShutter', 65: 'motionSensor', 69: 'environmentSensor', 70: 'troll',
    71: 'switchActor', 73: 'thermostat', 74: 'wallSwitch', E1: 'heatingActuator',
    A0: 'transmitter', A1: 'transmitter', A2: 'transmitter', A3: 'transmitter', A4: 'wallSwitch',
    A5: 'sunSensor', A7: 'transmitter', A8: 'homeTimer', A9: 'sunWindSensor', AA: 'awningSensor',
    AB: 'smokeDetector', AC: 'windowContact', AD: 'wallSwitch', AF: 'sunSensor', E0: 'central'
});

// Statusgruppen und Status-IDs. Die Positionsangaben sind Bytepositionen innerhalb der 10-Byte-Statusnutzdaten.
const statusGroups = Object.freeze({
    '21': [100,101,102,104,105,106,111,112,113,114,50],
    '22': [1,2,3,4,5,6,7,8,9,10],
    '23': [102,107,109,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,140,141,50],
    '23A': [102,107,109,115,116,117,118,119,120,121,122,123,124,125,126,127,133,140,141,50],
    '24': [102,107,115,116,117,118,119,120,121,122,123,124,125,126,127,140,141,400,402,50],
    '24A': [102,107,115,123,124,400,402,404,405,406,407,408,409,410,411,50],
    '25': [300,301,302,303,304,305,306,307,308,309,310,311,312,313],
    '27': [160,161,162,163,164,165,166,167,168,169,170,171],
    '29': [180,181,182,183,184,185,186,187,998],
    '2B': [300,301,302,303,304,305,306,307,308,309,310,311,312,313]
});

const statusMapping = Object.freeze({
    onOff: ['off', 'on'],
    upDown: ['up', 'down'],
    moving: ['stop', 'stop'],
    motor: ['off', 'short(160ms)', 'long(480ms)', 'individual'],
    closeT: ['off', '30', '60', '90', '120', '150', '180', '210', '240'],
    openS: ['error', '11', '15', '19'],
    scale10: [10, 0],
    scaleF1: [2, 80],
    scaleF2: [10, 400],
    scaleF3: [2, -8],
    scaleF4: [100, 0],
    hex: [1, 0]
});

const statusIds = Object.freeze({
    1: { name: 'level', chan: { '01': { position: 7, from: 0, to: 6 }, '02': { position: 6, from: 0, to: 6 } } },
    2: { name: 'timeAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 0, to: 0 }, '02': { position: 2, from: 0, to: 0 } } },
    3: { name: 'duskAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 1, to: 1 }, '02': { position: 2, from: 1, to: 1 } } },
    4: { name: 'dawnAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 6, to: 6 }, '02': { position: 2, from: 6, to: 6 } } },
    5: { name: 'sunAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 2, to: 2 }, '02': { position: 2, from: 2, to: 2 } } },
    6: { name: 'manualMode', map: 'onOff', chan: { '01': { position: 3, from: 5, to: 5 }, '02': { position: 2, from: 5, to: 5 } } },
    7: { name: 'modeChange', map: 'onOff', chan: { '01': { position: 7, from: 7, to: 7 }, '02': { position: 6, from: 7, to: 7 } } },
    8: { name: 'sunMode', map: 'onOff', chan: { '01': { position: 3, from: 4, to: 4 }, '02': { position: 2, from: 4, to: 4 } } },
    9: { name: 'stairwellFunction', map: 'onOff', chan: { '01': { position: 4, from: 7, to: 7 }, '02': { position: 0, from: 7, to: 7 } } },
    10: { name: 'stairwellTime', map: 'scale10', chan: { '01': { position: 5, from: 0, to: 14 }, '02': { position: 1, from: 0, to: 14 } } },
    50: { name: 'moving', map: 'moving', chan: { '01': { position: 0, from: 0, to: 0 }, '02': { position: 0, from: 0, to: 0 } } },
    100: { name: 'sunAutomatic', map: 'onOff', chan: { '01': { position: 0, from: 2, to: 2 } } },
    101: { name: 'timeAutomatic', map: 'onOff', chan: { '01': { position: 0, from: 0, to: 0 } } },
    102: { name: 'position', chan: { '01': { position: 7, from: 0, to: 6 } } },
    104: { name: 'duskAutomatic', map: 'onOff', chan: { '01': { position: 0, from: 3, to: 3 } } },
    105: { name: 'dawnAutomatic', map: 'onOff', chan: { '01': { position: 1, from: 3, to: 3 } } },
    106: { name: 'manualMode', map: 'onOff', chan: { '01': { position: 0, from: 7, to: 7 } } },
    107: { name: 'manualMode', map: 'onOff', chan: { '01': { position: 3, from: 5, to: 5 } } },
    109: { name: 'runningTime', chan: { '01': { position: 6, from: 0, to: 7 } } },
    111: { name: 'sunPosition', invert: 100, chan: { '01': { position: 6, from: 0, to: 6 } } },
    112: { name: 'ventilatingPosition', invert: 100, chan: { '01': { position: 2, from: 0, to: 6 } } },
    113: { name: 'ventilatingMode', map: 'onOff', chan: { '01': { position: 2, from: 7, to: 7 } } },
    114: { name: 'sunMode', map: 'onOff', chan: { '01': { position: 6, from: 7, to: 7 } } },
    115: { name: 'timeAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 0, to: 0 } } },
    116: { name: 'sunAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 2, to: 2 } } },
    117: { name: 'dawnAutomatic', map: 'onOff', chan: { '01': { position: 2, from: 1, to: 1 } } },
    118: { name: 'duskAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 1, to: 1 } } },
    119: { name: 'rainAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 7, to: 7 } } },
    120: { name: 'windAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 6, to: 6 } } },
    121: { name: 'sunPosition', invert: 100, chan: { '01': { position: 5, from: 0, to: 6 } } },
    122: { name: 'sunMode', map: 'onOff', chan: { '01': { position: 3, from: 4, to: 4 } } },
    123: { name: 'ventilatingPosition', invert: 100, chan: { '01': { position: 4, from: 0, to: 6 } } },
    124: { name: 'ventilatingMode', map: 'onOff', chan: { '01': { position: 4, from: 7, to: 7 } } },
    125: { name: 'reversal', map: 'onOff', chan: { '01': { position: 7, from: 7, to: 7 } } },
    126: { name: 'rainDirection', map: 'upDown', chan: { '01': { position: 2, from: 3, to: 3 } } },
    127: { name: 'windDirection', map: 'upDown', chan: { '01': { position: 2, from: 2, to: 2 } } },
    128: { name: 'slatRunTime', chan: { '01': { position: 0, from: 0, to: 5 } } },
    129: { name: 'tiltAfterMoveLevel', map: 'onOff', chan: { '01': { position: 0, from: 6, to: 6 } } },
    130: { name: 'tiltInVentPos', map: 'onOff', chan: { '01': { position: 0, from: 7, to: 7 } } },
    131: { name: 'defaultSlatPos', chan: { '01': { position: 1, from: 0, to: 6 } } },
    132: { name: 'tiltAfterStopDown', map: 'onOff', chan: { '01': { position: 1, from: 7, to: 7 } } },
    133: { name: 'motorDeadTime', map: 'motor', chan: { '01': { position: 2, from: 4, to: 5 } } },
    134: { name: 'tiltInSunPos', map: 'onOff', chan: { '01': { position: 5, from: 7, to: 7 } } },
    135: { name: 'slatPosition', chan: { '01': { position: 9, from: 0, to: 6 } } },
    136: { name: 'blindsMode', map: 'onOff', chan: { '01': { position: 9, from: 7, to: 7 } } },
    140: { name: 'windMode', map: 'onOff', chan: { '01': { position: 3, from: 3, to: 3 } } },
    141: { name: 'rainMode', map: 'onOff', chan: { '01': { position: 2, from: 0, to: 0 } } },
    160: { name: 'temperatureThreshold1', map: 'scaleF1', chan: { '01': { position: 4, from: 0, to: 7 } } },
    161: { name: 'temperatureThreshold2', map: 'scaleF1', chan: { '01': { position: 5, from: 0, to: 7 } } },
    162: { name: 'temperatureThreshold3', map: 'scaleF1', chan: { '01': { position: 6, from: 0, to: 7 } } },
    163: { name: 'temperatureThreshold4', map: 'scaleF1', chan: { '01': { position: 7, from: 0, to: 7 } } },
    164: { name: 'desired-temp', map: 'scaleF1', chan: { '01': { position: 9, from: 0, to: 7 } } },
    165: { name: 'measured-temp', map: 'scaleF2', chan: { '01': { position: 1, from: 0, to: 10 } } },
    166: { name: 'output', map: 'onOff', chan: { '01': { position: 0, from: 3, to: 3 } } },
    167: { name: 'manualOverride', map: 'onOff', chan: { '01': { position: 0, from: 4, to: 4 } } },
    168: { name: 'actTempLimit', chan: { '01': { position: 0, from: 5, to: 6 } } },
    169: { name: 'timeAutomatic', map: 'onOff', chan: { '01': { position: 2, from: 3, to: 3 } } },
    170: { name: 'manualMode', map: 'onOff', chan: { '01': { position: 2, from: 4, to: 4 } } },
    171: { name: 'measured-temp2', map: 'scaleF2', chan: { '01': { position: 3, from: 0, to: 10 } } },
    180: { name: 'desired-temp', map: 'scaleF3', chan: { '01': { position: 0, from: 0, to: 5 } } },
    181: { name: 'measured-temp', map: 'scaleF4', chan: { '01': { position: 2, from: 0, to: 15 } } },
    182: { name: 'manualMode', map: 'onOff', chan: { '01': { position: 4, from: 0, to: 0 } } },
    183: { name: 'timeAutomatic', map: 'onOff', chan: { '01': { position: 4, from: 1, to: 1 } } },
    184: { name: 'sendingInterval', chan: { '01': { position: 4, from: 6, to: 11 } } },
    185: { name: 'batteryPercent', chan: { '01': { position: 7, from: 0, to: 6 } } },
    186: { name: 'valvePosition', chan: { '01': { position: 6, from: 0, to: 6 } } },
    187: { name: 'forceResponse', chan: { '01': { position: 8, from: 7, to: 7 } } },
    300: { name: 'level', chan: { '01': { position: 7, from: 0, to: 6 } } },
    301: { name: 'manualMode', map: 'onOff', chan: { '01': { position: 3, from: 5, to: 5 } } },
    302: { name: 'timeAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 0, to: 0 } } },
    303: { name: 'duskAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 1, to: 1 } } },
    304: { name: 'sunAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 2, to: 2 } } },
    305: { name: 'sunMode', map: 'onOff', chan: { '01': { position: 3, from: 4, to: 4 } } },
    306: { name: 'dawnAutomatic', map: 'onOff', chan: { '01': { position: 3, from: 6, to: 6 } } },
    307: { name: 'runningTime', chan: { '01': { position: 5, from: 0, to: 7 } } },
    308: { name: 'intermediateValue', chan: { '01': { position: 6, from: 0, to: 6 } } },
    309: { name: 'intermediateMode', map: 'onOff', chan: { '01': { position: 6, from: 7, to: 7 } } },
    310: { name: 'modeChange', map: 'onOff', chan: { '01': { position: 7, from: 7, to: 7 } } },
    311: { name: 'stairwellFunction', map: 'onOff', chan: { '01': { position: 1, from: 7, to: 7 } } },
    312: { name: 'stairwellTime', map: 'scale10', chan: { '01': { position: 2, from: 0, to: 14 } } },
    313: { name: 'saveIntermediateOnStop', map: 'onOff', chan: { '01': { position: 3, from: 7, to: 7 } } },
    400: { name: 'obstacle', chan: { '01': { position: 2, from: 4, to: 4 } } },
    401: { name: 'obstacleDetection', map: 'onOff', chan: { '01': { position: 2, from: 5, to: 5 } } },
    402: { name: 'block', chan: { '01': { position: 2, from: 6, to: 6 } } },
    403: { name: 'blockDetection', map: 'onOff', chan: { '01': { position: 2, from: 7, to: 7 } } },
    404: { name: 'lightCurtain', chan: { '01': { position: 0, from: 7, to: 7 } } },
    405: { name: 'automaticClosing', map: 'closeT', chan: { '01': { position: 1, from: 0, to: 3 } } },
    406: { name: 'openSpeed', map: 'openS', chan: { '01': { position: 1, from: 4, to: 6 } } },
    407: { name: '2000cycleAlarm', map: 'onOff', chan: { '01': { position: 1, from: 7, to: 7 } } },
    408: { name: 'wicketDoor', map: 'onOff', chan: { '01': { position: 5, from: 7, to: 7 } } },
    409: { name: 'backJump', map: 'onOff', chan: { '01': { position: 9, from: 0, to: 0 } } },
    410: { name: '10minuteAlarm', map: 'onOff', chan: { '01': { position: 9, from: 1, to: 1 } } },
    411: { name: 'light', map: 'onOff', chan: { '01': { position: 9, from: 2, to: 2 } } },
    998: { name: 'version', map: 'hex', chan: { '01': { position: 9, from: 0, to: 6 } } },
    999: { name: 'version', map: 'hex', chan: { '01': { position: 8, from: 0, to: 7 }, '02': { position: 8, from: 0, to: 7 } } }
});

function normalizeHex(value) {
    return String(value || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function extractDongleSerial(value) {
    const text = String(value || '').toUpperCase();
    const matches = text.match(/6F[0-9A-F]{4}/g);
    if (matches && matches.length) {
        return matches[matches.length - 1];
    }
    return normalizeHex(value);
}

function isHex44(value) {
    return HEX44.test(normalizeHex(value));
}

function isDeviceCode(value) {
    return HEX6OR8.test(normalizeHex(value));
}

function normalizeDeviceCode(value) {
    const code = normalizeHex(value);
    if (!isDeviceCode(code)) {
        throw new Error(`Invalid DuoFern device code "${value}". Expected 6 or 8 hex digits.`);
    }
    return code;
}

function parseDeviceCodes(input) {
    const text = String(input || '').toUpperCase();
    const found = [];
    const defineRegex = /^\s*define\s+\S+\s+DUOFERN\s+([0-9A-F]{6}(?:[0-9A-F]{2})?)/gmi;
    let match;
    while ((match = defineRegex.exec(text)) !== null) {
        found.push(match[1]);
    }
    if (!found.length) {
        for (const token of text.split(/[;,\s]+/).map(v => v.trim()).filter(Boolean)) {
            if (HEX6OR8.test(token)) {
                found.push(token);
            }
        }
    }
    const result = [];
    const seen = new Set();
    for (const value of found) {
        const code = normalizeDeviceCode(value);
        if (code.startsWith('6F')) {
            continue;
        }
        if (!seen.has(code)) {
            seen.add(code);
            result.push(code);
        }
    }
    return result;
}

function deviceClass(code) {
    const c = normalizeHex(code).substring(0, 2);
    return devicePrefixes[c] || 'unknown';
}

function deviceStatusGroup(code) {
    // Diese Funktion bildet nur feste Format-Sonderfälle ab.
    // Wichtig: Rohrmotor-Aktor (42), Rohrmotor (49), Connect-Aktor (4B), Troll Basis (4C)
    // und Troll Comfort (70) werden NICHT pauschal auf Gruppe 23 gezwungen.
    // Bei diesen Geräten entscheidet das tatsächlich empfangene Gruppenbyte im Telegramm.
    // Ein erzwungenes Gruppe-23-Layout war die Ursache dafür, dass nach Status-Polls echte
    // Werte mit falsch dekodierten 0-Werten überschrieben wurden.
    const prefix = normalizeHex(code).substring(0, 2);
    if (prefix === '47' || prefix === '69') return '23A';
    if (prefix === '4E') return '24A';
    return null;
}

function deviceDefaultStatusGroup(code) {
    // Fallback nur dann, wenn im Telegramm gar keine verwertbare Gruppe erkennbar ist.
    // Dieser Fallback gilt als unsicher und darf bestehende Werte nicht blind überschreiben.
    const prefix = normalizeHex(code).substring(0, 2);
    if (prefix === '40' || prefix === '41' || prefix === '61' || prefix === '62') return '21';
    if (prefix === '42' || prefix === '47' || prefix === '49' || prefix === '4B' || prefix === '4C' || prefix === '70') return '23';
    if (prefix === '48' || prefix === '4A') return '25';
    if (prefix === '73') return '27';
    if (prefix === 'E1') return '29';
    if (prefix === '43' || prefix === '46' || prefix === '71') return '22';
    if (prefix === '65' || prefix === 'A5' || prefix === 'A9' || prefix === 'AA' || prefix === 'AB' || prefix === 'AC' || prefix === 'AF') return '2B';
    if (prefix === '74' || prefix === 'A0' || prefix === 'A1' || prefix === 'A2' || prefix === 'A3' || prefix === 'A4' || prefix === 'A7' || prefix === 'A8' || prefix === 'AD' || prefix === 'E0') return '2B';
    return null;
}


// Geräteprofile und erlaubte Befehle nach Gerätecode.
// Die Einteilung entspricht den Produktgruppen der DuoFern-Gerätefamilie:
// Gurtwickler/Rollladenaktoren, Rohrmotor-/Troll-Aktoren, Schaltaktoren,
// Dimmer, Umweltsensor, Thermostat, Heizkörperstellantrieb usw.
// Der Adapter nutzt diese Profile an zwei Stellen:
// 1. Es werden nur passende ioBroker-States für das jeweilige Produkt angelegt.
// 2. Dekodierte Werte werden nur geschrieben, wenn sie zum Produktprofil passen.
const profileCommandGroups = Object.freeze({
    basic: ['reset', 'remotePair', 'remoteUnpair'],
    resetOnly: ['reset'],
    pair: ['remotePair', 'remoteUnpair'],
    remoteMinimal: ['getStatus', 'remotePair', 'remoteUnpair'],
    sensorMinimal: ['getStatus'],
    defaultRollerShutter: [
        'getStatus', 'up', 'down', 'stop', 'toggle', 'dusk', 'dawn',
        'sunMode', 'position', 'sunPosition', 'ventilatingPosition',
        'dawnAutomatic', 'duskAutomatic', 'manualMode', 'sunAutomatic',
        'timeAutomatic', 'ventilatingMode'
    ],
    rolloTube: [
        'windAutomatic', 'rainAutomatic', 'windDirection', 'rainDirection',
        'windMode', 'rainMode', 'reversal'
    ],
    troll: [
        'windAutomatic', 'rainAutomatic', 'windDirection', 'rainDirection',
        'windMode', 'rainMode', 'runningTime', 'motorDeadTime', 'reversal'
    ],
    blindsModeSwitch: ['blindsMode'],
    blinds: [
        'tiltInSunPos', 'tiltInVentPos', 'tiltAfterMoveLevel',
        'tiltAfterStopDown', 'defaultSlatPos', 'slatRunTime', 'slatPosition'
    ],
    switchActor: [
        'getStatus', 'dawnAutomatic', 'duskAutomatic', 'manualMode',
        'sunAutomatic', 'timeAutomatic', 'sunMode', 'modeChange',
        'stairwellFunction', 'stairwellTime', 'on', 'off', 'dusk', 'dawn'
    ],
    environmentSensor: ['getStatus', 'getWeather', 'getTime'],
    environmentSensor00: [
        'getWeather', 'getTime', 'getConfig', 'writeConfig', 'DCF', 'interval',
        'latitude', 'longitude', 'timezone', 'time', 'triggerDawn', 'triggerDusk',
        'triggerRain', 'triggerSun', 'triggerSunDirection', 'triggerSunHeight',
        'triggerTemperature', 'triggerWind'
    ],
    environmentSensor01: [
        'windAutomatic', 'rainAutomatic', 'windDirection', 'rainDirection',
        'windMode', 'rainMode', 'runningTime', 'reversal'
    ],
    sx5: [
        'getStatus', 'up', 'down', 'stop', 'position', 'ventilatingPosition',
        'manualMode', 'timeAutomatic', 'ventilatingMode', '10minuteAlarm',
        'automaticClosing', '2000cycleAlarm', 'openSpeed', 'backJump'
    ],
    dimmer: [
        'getStatus', 'level', 'on', 'off', 'dawnAutomatic', 'duskAutomatic',
        'manualMode', 'sunAutomatic', 'timeAutomatic', 'sunMode', 'modeChange',
        'stairwellFunction', 'stairwellTime', 'runningTime', 'intermediateMode',
        'intermediateValue', 'saveIntermediateOnStop', 'dusk', 'dawn'
    ],
    thermostat: [
        'getStatus', 'tempUp', 'tempDown', 'manualMode', 'timeAutomatic',
        'temperatureThreshold1', 'temperatureThreshold2', 'temperatureThreshold3',
        'temperatureThreshold4', 'actTempLimit', 'desired-temp'
    ],
    hsa: ['manualMode', 'timeAutomatic', 'windowContact', 'sendingInterval', 'desired-temp']
});

function uniqueList(items) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        out.push(item);
    }
    return out;
}

function addGroup(target, groupName) {
    const group = profileCommandGroups[groupName] || [];
    for (const item of group) target.push(item);
}

function truthyReading(value) {
    if (value === true) return true;
    if (typeof value === 'number') return value !== 0;
    const v = String(value ?? '').trim().toLowerCase();
    return v === 'on' || v === 'true' || v === '1' || v === 'yes' || v === 'ja';
}

function deviceCommandProfile(code, readings = {}) {
    const normalized = normalizeHex(code).padEnd(8, '0').substring(0, 8).toUpperCase();
    const prefix = normalized.substring(0, 2);
    const channel = normalized.length >= 8 ? normalized.substring(6, 8) : '';
    const list = [];
    let profile = 'unknown';

    if (prefix === '49') {
        profile = 'rolloTube';
        addGroup(list, 'basic');
        addGroup(list, 'defaultRollerShutter');
        addGroup(list, 'rolloTube');
    } else if (['42', '4B', '4C', '70'].includes(prefix)) {
        // V19-Technik behalten, aber die aus der Geräteliste fehlenden Jalousie-/Lamellen-Aktoren
        // fest als venetianBlinds behandeln. Dadurch werden slatPosition, defaultSlatPos usw.
        // sofort angelegt und nicht erst, wenn blindsMode vorher empfangen wurde.
        profile = 'venetianBlinds';
        addGroup(list, 'basic');
        addGroup(list, 'defaultRollerShutter');
        addGroup(list, 'troll');
        addGroup(list, 'blindsModeSwitch');
        addGroup(list, 'blinds');
    } else if (prefix === '47') {
        profile = 'troll';
        addGroup(list, 'basic');
        addGroup(list, 'defaultRollerShutter');
        addGroup(list, 'troll');
    } else if (['40', '41', '61', '62'].includes(prefix)) {
        profile = 'rollerShutter';
        addGroup(list, 'basic');
        addGroup(list, 'defaultRollerShutter');
    } else if (prefix === '69' && channel === '00') {
        profile = 'environmentSensorChannel00';
        addGroup(list, 'environmentSensor00');
    } else if (prefix === '69' && channel === '01') {
        profile = 'environmentSensorChannel01';
        addGroup(list, 'defaultRollerShutter');
        addGroup(list, 'environmentSensor01');
        addGroup(list, 'pair');
    } else if (prefix === '69') {
        profile = 'environmentSensor';
        addGroup(list, 'resetOnly');
        addGroup(list, 'environmentSensor');
    } else if (prefix === '43' && (channel === '01' || channel === '02')) {
        profile = 'switchActorChannel';
        addGroup(list, 'switchActor');
        addGroup(list, 'pair');
    } else if (prefix === '43' && !channel) {
        profile = 'switchActorBase';
        addGroup(list, 'resetOnly');
        list.push('getStatus');
    } else if (['46', '71'].includes(prefix)) {
        profile = 'switchActor';
        addGroup(list, 'basic');
        addGroup(list, 'switchActor');
    } else if (['65', 'A5', 'A9', 'AA', 'AB', 'AC', 'AF'].includes(prefix)) {
        profile = 'sensor';
        addGroup(list, 'resetOnly');
        addGroup(list, 'sensorMinimal');
    } else if (['74', 'A0', 'A1', 'A2', 'A3', 'A4', 'A7', 'A8', 'AD', 'E0'].includes(prefix)) {
        profile = 'remote';
        addGroup(list, 'remoteMinimal');
    } else if (prefix === '4E') {
        profile = 'sx5';
        addGroup(list, 'basic');
        addGroup(list, 'sx5');
    } else if (['48', '4A'].includes(prefix)) {
        profile = 'dimmer';
        addGroup(list, 'basic');
        addGroup(list, 'dimmer');
    } else if (prefix === '73') {
        profile = 'thermostat';
        addGroup(list, 'basic');
        addGroup(list, 'thermostat');
    } else if (prefix === 'E1') {
        profile = 'heatingActuator';
        addGroup(list, 'hsa');
    }

    return { profile, commands: uniqueList(list) };
}

function deviceAllowedCommands(code, readings = {}) {
    return new Set(deviceCommandProfile(code, readings).commands);
}

function deviceAllowedReadings(code, readings = {}) {
    const allowed = deviceAllowedCommands(code, readings);
    const result = new Set([
        'raw', 'lastSeen', 'lastDecoded', 'messageType', 'channel', 'payload', 'sourceCode', 'targetCode',
        'deviceClass', 'deviceProfile', 'command', 'lastCommand', 'lastCommandTime', 'statusGroup',
        'statusPayload', 'statusPayloadOffset', 'stateText', 'getStatus'
    ]);
    for (const name of allowed) result.add(name);
    if (allowed.has('position')) {
        result.add('rawPosition');
        result.add('targetPosition');
        result.add('moving');
    }
    if (allowed.has('level')) result.add('targetLevel');
    if (allowed.has('on') || allowed.has('off') || allowed.has('level')) result.add('state');
    return result;
}

function commandSupportedByDevice(code, commandName, readings = {}) {
    if (commandName === 'raw') return true;
    const allowed = deviceAllowedCommands(code, readings);
    return allowed.has(commandName);
}

function looksLikeDeviceCode(code, dongleSerial) {
    const c = normalizeHex(code);
    const dongle = normalizeHex(dongleSerial);
    return HEX6.test(c) && c !== '000000' && c !== 'FFFFFF' && c !== dongle && Boolean(devicePrefixes[c.substring(0, 2)]);
}

function extractDeviceCode(msg, dongleSerial) {
    const hex = normalizeHex(msg);
    if (!HEX44.test(hex)) return null;

    // Die Gerätekennung wird jetzt bewusst exakt an den Protokollpositionen gelesen:
    // - bei normalen 06/0F-Telegrammen steht der Gerätecode an Hex-Offset 30
    // - bei 81-Antworttelegrammen steht der Gerätecode an Hex-Offset 36
    // Ein früherer Suchlauf über mehrere Offsets konnte zufällig andere Hexfolgen als
    // Gerätecode interpretieren und dadurch Statuswerte falschen Geräten zuordnen.
    const candidate = /^81/i.test(hex) ? hex.substring(36, 42) : hex.substring(30, 36);
    return looksLikeDeviceCode(candidate, dongleSerial) ? candidate : null;
}

function parseTelegram(msg, dongleSerial) {
    const hex = normalizeHex(msg);
    if (!HEX44.test(hex)) {
        throw new Error('Telegram must be exactly 44 hex digits');
    }
    const result = {
        raw: hex,
        type: hex.substring(0, 2),
        channel: hex.substring(2, 4),
        payload: hex.substring(4, 24),
        reserved: hex.substring(24, 30),
        sourceCode: hex.substring(30, 36),
        targetCode: hex.substring(36, 42),
        tail: hex.substring(42, 44),
        isAck: hex === constants.duoACK,
        isStickControlAck: /^81000000[0-9A-F]{36}$/i.test(hex),
        isQueueTrigger: /^81[0-9A-F]{42}$/i.test(hex),
        deviceCode: extractDeviceCode(hex, dongleSerial)
    };
    result.deviceClass = result.deviceCode ? deviceClass(result.deviceCode) : 'unknown';
    return result;
}

function buildRemotePairStick(serial) {
    const code = normalizeHex(serial);
    if (!HEX6.test(code)) {
        throw new Error('remotePair expects a 6 digit hex serial');
    }
    return constants.duoRemotePairStick.replace('yyyyyy', code);
}

function buildStatusRequest(code, statusName = 'getStatus') {
    const deviceCode = normalizeDeviceCode(code).substring(0, 6);
    const nn = statusCommands[statusName];
    if (!nn) {
        throw new Error(`Unknown status command "${statusName}"`);
    }
    return constants.duoDeviceStatusRequest.replace('nn', nn).replace('yyyyyy', deviceCode);
}

function toHexByte(value, label) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 255) throw new Error(`${label} must be between 0 and 255`);
    return Math.round(num).toString(16).padStart(2, '0').toUpperCase();
}

function toHexWord(value, label) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 65535) throw new Error(`${label} must be between 0 and 65535`);
    return Math.round(num).toString(16).padStart(4, '0').toUpperCase();
}

function buildCommandPayload(commandName, arg, options = {}) {
    const spec = commands[commandName];
    if (!spec) throw new Error(`Unknown command "${commandName}"`);
    let payload;
    const timer = options.timer ? '01' : '00';
    const channel = normalizeHex(options.channel || '01').padStart(2, '0').substring(0, 2);
    let argV = '00';
    let argW = '0000';
    if (spec.cmd.noArg) {
        payload = spec.cmd.noArg;
    } else if (spec.cmd.value) {
        if (arg === undefined || arg === null || arg === '') throw new Error(`Command "${commandName}" requires a value`);
        let numeric = Number(arg);
        if (!Number.isFinite(numeric)) throw new Error(`Command "${commandName}" requires a numeric value`);
        const min = spec.min ?? 0;
        const max = spec.max ?? 100;
        if (numeric < min || numeric > max) throw new Error(`Command "${commandName}" expects a value between ${min} and ${max}`);
        if (commandName !== 'position' && spec.invert !== undefined && options.positionInverse) numeric = spec.invert - numeric;
        const mapped = numeric * (spec.multi ?? 1) + (spec.offset ?? 0);
        argV = toHexByte(mapped, commandName);
        argW = toHexWord(mapped, commandName);
        payload = spec.cmd.value;
    } else {
        const key = String(arg || '').trim();
        if (!key || spec.cmd[key] === undefined) throw new Error(`Command "${commandName}" expects one of: ${Object.keys(spec.cmd).join(', ')}`);
        payload = spec.cmd[key];
    }
    return payload.replace(/tt/g, timer).replace(/nn/g, argV).replace(/wwww/g, argW).replace(/cc/g, channel).toUpperCase();
}

function buildDeviceCommand(code, commandName, arg, options = {}) {
    const deviceCode = normalizeDeviceCode(code).substring(0, 6);
    if (statusCommands[commandName]) return [buildStatusRequest(deviceCode, commandName)];
    if (commandName === 'raw') {
        const raw = normalizeHex(arg);
        if (!HEX44.test(raw)) throw new Error('raw command expects a 44 digit hex telegram');
        return [raw];
    }
    const payload = buildCommandPayload(commandName, arg, options);
    const channel = normalizeHex(options.channel || '01').padStart(2, '0').substring(0, 2);
    const spec = commands[commandName];
    const base = spec && spec.secondFrame ? constants.duoCommand2 : constants.duoCommand;
    const first = base.replace('cc', channel).replace('nnnnnnnnnnnnnnnnnnnn', payload).replace('yyyyyy', deviceCode).toUpperCase();
    if (spec && spec.secondFrame) {
        const second = constants.duoCommand3.replace('cc', channel).replace('nnnnnnnnnnnnnnnnnnnn', payload).replace('yyyyyy', deviceCode).toUpperCase();
        return [first, second];
    }
    return [first];
}

function buildSetPairs(codes) {
    return codes.map((code, index) => constants.duoSetPairs.replace('nn', (index & 0xff).toString(16).padStart(2, '0').toUpperCase()).replace('yyyyyy', normalizeDeviceCode(code).substring(0, 6)));
}

function buildInitSequence(codes = []) {
    const result = [
        { hex: constants.duoInit1, waitForResponse: true, name: 'INIT1' },
        { hex: constants.duoInit2, waitForResponse: true, name: 'INIT2' },
        { hex: constants.duoSetDongle, waitForResponse: true, name: 'SetDongle' },
        { hex: constants.duoACK, waitForAck: false, name: 'ACK after SetDongle' },
        { hex: constants.duoInit3, waitForResponse: true, name: 'INIT3' },
        { hex: constants.duoACK, waitForAck: false, name: 'ACK after INIT3' }
    ];
    for (const item of buildSetPairs(codes)) {
        result.push({ hex: item, waitForResponse: true, name: 'SetPairs' });
        result.push({ hex: constants.duoACK, waitForAck: false, name: 'ACK after SetPairs' });
    }
    result.push({ hex: constants.duoInitEnd, waitForResponse: true, name: 'INIT_END' });
    result.push({ hex: constants.duoACK, waitForAck: false, name: 'ACK after INIT_END' });
    return result;
}

function getBits(bytes, pos, from, to) {
    // Statuswerte werden wie im DuoFern-Protokoll als 16-Bit-Fenster gelesen:
    // zwei Bytes ab der angegebenen Byteposition, big-endian, danach Bits from..to.
    // Die vorherige byteweise Auswertung hat bei position/runningTime je nach Gerät
    // um ein Byte verschobene Werte erzeugt.
    const high = bytes[pos] !== undefined ? bytes[pos] : 0;
    const low = bytes[pos + 1] !== undefined ? bytes[pos + 1] : 0;
    const word = (high << 8) | low;
    const len = to - from + 1;
    return (word >> from) & ((1 << len) - 1);
}

function mapStatusValue(rawValue, def) {
    // DuoFern kennt bei einigen Positionswerten eine invertierte Darstellung.
    // Für den ioBroker-Bedienwert 'position' bleibt der Wert absichtlich unverändert,
    // damit Eingabe, Anzeige und rawPosition identisch sind (0 bleibt 0, 100 bleibt 100).
    let value = rawValue;
    if (def.invert !== undefined && def.name !== 'position') value = def.invert - value;
    if (!def.map) return value;
    const map = statusMapping[def.map];
    if (!map) return value;
    if (def.map === 'onOff') return Boolean(value);
    if (def.map.startsWith('scale')) return (value - map[1]) / map[0];
    return map[value] !== undefined ? map[value] : value;
}

function wireGroupToStatusGroup(wireGroup, code) {
    const group = normalizeHex(wireGroup).substring(0, 2);
    const formatOverride = deviceStatusGroup(code);
    // Nur echte Format-Sonderfälle wie 23A/24A dürfen das Telegramm-Gruppenbyte erweitern.
    // Normale Rohrmotor-Aktoren werden nach dem empfangenen Gruppenbyte dekodiert.
    if (formatOverride && formatOverride.toUpperCase().startsWith(group) && statusGroups[formatOverride]) return formatOverride;
    if (statusGroups[group]) return group;
    return null;
}

function getStatusDecodePlans(raw, code) {
    const hex = normalizeHex(raw);
    const byDevice = deviceStatusGroup(code);
    const defaultGroup = deviceDefaultStatusGroup(code);
    const plans = [];
    const seen = new Set();
    const add = (group, payloadStart, explicit, groupOffset, priority) => {
        if (!group || !statusGroups[group]) return;
        if (payloadStart < 0 || payloadStart + 20 > hex.length) return;
        const key = `${group}:${payloadStart}`;
        if (seen.has(key)) return;
        seen.add(key);
        plans.push({ group, payloadStart, explicit, groupOffset, priority });
    };

    // Echte Statusantworten des USB-Sticks haben die Struktur:
    // 0F FF 0F GG DD DD ... <sourceCode> FF FF FF 01
    // Das Status-/Formatbyte GG steht also an Hex-Offset 6 (nicht an Offset 4).
    // Wichtig: Die Auswertungstabellen benutzen dieses Formatbyte selbst als Byte 0.
    // Deshalb beginnt der Nutzdatenblock ebenfalls bei Offset 6. Wird stattdessen ab Offset 8
    // dekodiert, verschieben sich alle Werte um ein Byte und Position/runningTime springen
    // nach späteren Statusabfragen scheinbar auf 0.
    const isStatusAnswer = /^0FFF0F/i.test(hex);
    const primaryGroupOffset = isStatusAnswer ? 6 : 4;
    const primaryWireGroup = hex.substring(primaryGroupOffset, primaryGroupOffset + 2);
    const primaryGroup = wireGroupToStatusGroup(primaryWireGroup, code);
    if (primaryGroup) add(primaryGroup, primaryGroupOffset, true, primaryGroupOffset, 4000);
    // Einige Gerätetypen nutzen für dasselbe Gruppenbyte eine erweiterte Tabelle (z. B. 23A/24A).
    // Auch diese Tabelle muss denselben Startoffset behalten, weil das Gruppenbyte Byte 0 bleibt.
    if (byDevice && statusGroups[byDevice] && primaryGroup && byDevice !== primaryGroup) {
        add(byDevice, primaryGroupOffset, true, primaryGroupOffset, 4250);
    }

    // Zusätzliche Suchpositionen bleiben nur als unsichere Diagnose-Fallbacks erhalten.
    // Auch bei Fallbacks gilt: Wenn an dieser Stelle ein Gruppenbyte gefunden wurde,
    // beginnt der Auswerteblock genau an dieser Stelle und nicht ein Byte später.
    for (const groupOffset of [6, 4, 8, 10]) {
        if (groupOffset === primaryGroupOffset) continue;
        const wireGroup = hex.substring(groupOffset, groupOffset + 2);
        const group = wireGroupToStatusGroup(wireGroup, code);
        if (group) add(group, groupOffset, false, groupOffset, 250 - groupOffset);
    }

    // Geräteabhängiger Fallback, falls ein Telegramm keine sichtbare Statusgruppe enthält.
    // Auch dieser Fallback ist absichtlich niedrig priorisiert und wird im Adapter nur konservativ übernommen.
    if (defaultGroup && statusGroups[defaultGroup]) {
        for (const start of [6, 4, 8, 10, 12]) add(defaultGroup, start, false, null, 120 - start);
    }
    return plans.sort((a, b) => b.priority - a.priority);
}

function decodeStatusWithPlan(hex, code, channel, plan) {
    const payload = hex.substring(plan.payloadStart, plan.payloadStart + 24);
    const bytes = payload.match(/../g).map(b => parseInt(b, 16));
    const readings = {};
    const readingMeta = {};
    for (const id of statusGroups[plan.group] || []) {
        const def = statusIds[id];
        if (!def) continue;
        const ch = def.chan[channel] || def.chan['01'];
        if (!ch) continue;
        const rawValue = getBits(bytes, ch.position, ch.from, ch.to);
        const mapped = mapStatusValue(rawValue, def);
        if (readings[def.name] === undefined) {
            readings[def.name] = mapped;
            readingMeta[def.name] = {
                id,
                rawValue,
                group: plan.group,
                payloadStart: plan.payloadStart,
                position: ch.position,
                from: ch.from,
                to: ch.to,
                map: def.map || null,
                explicitGroup: Boolean(plan.explicit),
                groupOffset: plan.groupOffset,
                payloadAllZero: /^0+$/.test(payload),
                valueSource: plan.explicit ? 'explicit-status-group' : 'fallback-status-layout'
            };
        }
    }
    if (readings.level !== undefined && readings.state === undefined) readings.state = Number(readings.level) > 0;
    return {
        group: plan.group,
        payload,
        payloadStart: plan.payloadStart,
        explicitGroup: Boolean(plan.explicit),
        groupOffset: plan.groupOffset,
        quality: plan.explicit ? 'explicit-status-group' : 'fallback-status-layout',
        payloadAllZero: /^0+$/.test(payload),
        readings,
        readingMeta
    };
}

function scoreDecodedStatus(decoded) {
    let score = decoded.explicitGroup ? 10000 : 0;
    score += Object.keys(decoded.readings || {}).length * 10;
    if (decoded.readings.position !== undefined) score += 100;
    if (decoded.readings.level !== undefined) score += 80;
    if (decoded.readings.moving !== undefined) score += 20;
    if (decoded.payload && !/^0+$/.test(decoded.payload)) score += 10;
    return score;
}

function decodeStatusTelegram(raw, code, channel = '01') {
    const hex = normalizeHex(raw);
    if (!HEX44.test(hex) || !code) return { group: null, readings: {}, readingMeta: {}, payload: '', payloadStart: null, statusFrame: false };

    // Gerätewerte werden nur aus echten Statusnachrichten übernommen.
    // Viele Antworten sehen wie 0F FF 0F ... aus; einige Aktoren liefern aber kanalbezogen
    // 0F 01 0F ... oder 0F 02 0F ... zurück. Entscheidend ist daher: Typ 0F und Status-ID 0F.
    // ACK-, Kommando- und Fernbedienungsrahmen dürfen keine Positionswerte schreiben.
    if (!/^0F[0-9A-F]{2}0F/i.test(hex)) {
        return { group: null, readings: {}, readingMeta: {}, payload: '', payloadStart: null, statusFrame: false, quality: 'not-a-status-frame' };
    }

    let group = hex.substring(6, 8).toUpperCase();
    const override = deviceStatusGroup(code);
    if (override && statusGroups[override]) group = override;

    const payloadStart = 6;
    if (!statusGroups[group]) {
        return {
            group,
            readings: {},
            readingMeta: {},
            payload: hex.substring(payloadStart, payloadStart + 24),
            payloadStart,
            explicitGroup: true,
            statusFrame: true,
            quality: 'unknown-status-group',
            payloadAllZero: /^0+$/.test(hex.substring(payloadStart, payloadStart + 24))
        };
    }

    const decoded = decodeStatusWithPlan(hex, code, channel, {
        group,
        payloadStart,
        explicit: true,
        groupOffset: 6,
        priority: 10000
    });
    decoded.statusFrame = true;
    decoded.quality = 'exact-status-frame';
    return decoded;
}

function deviceDefaultReadings(code) {
    // Ab Version 0.1.12 werden Gerätewerte nicht mehr vorab aus der gesamten Statustabelle erzeugt.
    // Genauso bleibt der Objektbaum schlank: Ein Reading entsteht erst, wenn es vom Gerät tatsächlich geliefert wird.
    return ['statusGroup', 'statusPayload', 'statusPayloadOffset', 'stateText'];
}

module.exports = {
    constants,
    commands,
    statusCommands,
    statusGroups,
    statusIds,
    normalizeHex,
    extractDongleSerial,
    isHex44,
    isDeviceCode,
    normalizeDeviceCode,
    parseDeviceCodes,
    parseTelegram,
    extractDeviceCode,
    deviceClass,
    profileCommandGroups,
    deviceCommandProfile,
    deviceAllowedCommands,
    deviceAllowedReadings,
    commandSupportedByDevice,
    deviceStatusGroup,
    deviceDefaultStatusGroup,
    deviceDefaultReadings,
    decodeStatusTelegram,
    buildRemotePairStick,
    buildStatusRequest,
    buildDeviceCommand,
    buildInitSequence,
    buildSetPairs
};
