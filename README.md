# ioBroker Adapter: DuoFern Stick

This adapter connects a local **Rademacher DuoFern USB Stick** to ioBroker. It is designed for installations where DuoFern devices should be integrated locally without an additional cloud service.

## Features

- Serial connection to the Rademacher DuoFern USB Stick
- Configuration of serial port, baud rate and dongle serial in ioBroker Admin
- Reception and parsing of DuoFern telegrams
- Automatic creation of detected devices below `devices.*`
- Device and capability catalogue for many DuoFern device classes
- State handling for shutters, tubular motors, actuators, dimmers, sensors, remotes and thermostats
- Control states for pairing, unpairing, status broadcast and raw telegrams
- Partial state updates to avoid overwriting existing values with incomplete telegram data
- Protection against unintended reset of `runningTime` to `0`
- Optional raw telegram logging for diagnostics

## Supported device classes

The adapter contains a device and capability catalogue for several DuoFern device classes, including:

| Device class | Examples |
| --- | --- |
| Shutters / belt winders | RolloTron Standard, RolloTron Comfort Master/Slave |
| Tubular motors | Tubular motor, tubular motor actuator, tubular motor controller |
| Venetian blinds | Troll Comfort, Troll Basis, Connect actuator |
| Actuators | Universal actuator, socket actuator, light and switching actuators |
| Dimmers | Dimming actuator, dimmer |
| Sensors | Sun/wind sensor, environmental sensor, motion detector, smoke detector, window/door contact |
| Remotes / transmitters | Hand transmitter, wall switch, HomeTimer, flush-mounted transmitter |
| Heating | Room thermostat, radiator actuator |
| Gate / special devices | SX5 / gate controller |

Depending on the detected device type, only suitable or observed states are created. This avoids showing every theoretical state for every device.

## Requirements

- ioBroker with js-controller 6.0.11 or newer
- Node.js 20 or newer
- ioBroker Admin 7.6.17 or newer
- Rademacher DuoFern USB Stick
- Access to the serial device of the USB stick

On Linux, the ioBroker process must have permission to access the serial device. Common paths are:

```text
/dev/ttyUSB0
/dev/serial/by-id/usb-Rademacher_DuoFern_USB-Stick-if00-port0
```

Using the stable `/dev/serial/by-id/` path is recommended because it normally stays the same after rebooting or reconnecting the USB stick.

## Installation

Install the adapter through ioBroker Admin using the custom adapter installation from a GitHub URL or from an uploaded package file.

After installation:

1. Create an adapter instance named `duofernstick.0`.
2. Open the adapter configuration.
3. Enter the correct serial port of the DuoFern USB Stick.
4. Start the adapter.
5. Check the connection state at `duofernstick.0.info.connection`.

## Configuration

The main settings are available in the Admin configuration page of the adapter instance.

| Setting | Description |
| --- | --- |
| `serialPort` | Serial port of the DuoFern USB Stick |
| `baudRate` | Baud rate, default: `115200` |
| `dongleSerial` | Serial number of the DuoFern stick, usually starting with `6F` |
| `autoCreateDevices` | Automatically create detected devices |
| `statusOnStart` | Request device status when the adapter starts |
| `preserveUnknownValues` | Preserve existing values when incoming telegrams are incomplete |
| `createOnlySupportedStates` | Create only suitable or observed states per device |
| `debugRaw` | Log raw telegrams for diagnostics |

## Object structure

The adapter creates the following main object tree:

```text
duofernstick.0
├── info
│   ├── connection
│   ├── lastRawTelegram
│   └── lastError
├── control
│   ├── pair
│   ├── unpair
│   ├── statusBroadcast
│   └── raw
└── devices
    └── <deviceId>
        ├── serial
        ├── deviceType
        ├── deviceTypeName
        ├── lastSeen
        ├── rawTelegram
        ├── command
        ├── getStatus
        ├── up
        ├── down
        ├── stop
        ├── position
        └── ...
```

The exact number of states depends on the detected device type.

## Central control states

### Start pairing

```text
duofernstick.0.control.pair = true
```

Starts pairing mode of the stick.

### Start unpairing

```text
duofernstick.0.control.unpair = true
```

Starts unpairing mode of the stick.

### Send status broadcast

```text
duofernstick.0.control.statusBroadcast = true
```

Requests status information from known or reachable devices.

### Send raw telegram

```text
duofernstick.0.control.raw = <HEX_TELEGRAM>
```

Sends a raw telegram as a hexadecimal string. This is mainly intended for diagnostics and development.

## Device control

Depending on the device type, the following writable states may be available:

| State | Meaning |
| --- | --- |
| `up` | Move shutter or blind up |
| `down` | Move shutter or blind down |
| `stop` | Stop current movement |
| `toggle` | Toggle command |
| `position` | Target position in percent |
| `getStatus` | Request device status |
| `manualMode` | Manual mode |
| `timeAutomatic` | Time automation |
| `sunAutomatic` | Sun automation |
| `duskAutomatic` | Dusk automation |
| `dawnAutomatic` | Dawn automation |
| `windAutomatic` | Wind automation |
| `rainAutomatic` | Rain automation |
| `level` | Dimming or switching level |
| `state` | Switch state |

Example state IDs:

```text
duofernstick.0.devices.<deviceId>.up
duofernstick.0.devices.<deviceId>.down
duofernstick.0.devices.<deviceId>.stop
duofernstick.0.devices.<deviceId>.position
```

## Status values

Typical read-only status values are:

| State | Description |
| --- | --- |
| `position` | Current position in percent |
| `moving` | Device is currently moving |
| `direction` | Movement direction: `up`, `down`, `stop` or `unknown` |
| `runningTime` | Runtime in seconds |
| `lastSeen` | Timestamp of the last received telegram |
| `rawTelegram` | Last telegram received from this device |
| `deviceType` | DuoFern device type code |
| `deviceTypeName` | Detected device name |

Incoming telegrams are handled as partial state updates. If a telegram does not contain a runtime value, an already existing runtime value is not automatically reset to `0`.

## Troubleshooting

### The adapter does not connect to the stick

Check the following points:

- The configured serial port exists.
- The ioBroker user has permission to access the serial device.
- The USB stick is passed through to the correct host, container or virtual machine.
- No other process blocks the serial port.
- The baud rate is configured correctly.

Useful Linux commands:

```text
ls -l /dev/ttyUSB*
ls -l /dev/serial/by-id/
dmesg | grep -i tty
```

### No devices are created

Check the following points:

- `autoCreateDevices` is enabled.
- Raw telegrams appear in `info.lastRawTelegram`.
- `debugRaw` is enabled for diagnostics.
- A DuoFern device or remote control action has been triggered.

### Values look unstable or implausible

Check the following points:

- Whether several devices are detected with the same or an incorrect ID.
- Whether raw telegrams are received completely.
- Whether the correct device type is detected.
- Whether the device actively sends status values or only answers once after startup.

For diagnostics, the following information is useful:

- Adapter version
- ioBroker version
- Node.js version
- Operating system, Docker, VM or Proxmox setup
- Serial device path of the USB stick
- DuoFern device type
- Relevant raw telegrams
- ioBroker log output during startup and device actions

## Changelog


### 0.1.27

- Added jsonConfig i18n files for all required ioBroker languages.
- Removed legacy Materialize admin page because jsonConfig is used.
- Replaced plain timers with adapter timers for ioBroker checker compliance.

### 0.1.26

- Restored the proven DuoFern runtime logic and kept compatibility with the current GitHub/ioBroker package structure.
- Keeps support for the previous `port` configuration and the newer `serialPort` alias.


### 0.1.23

- Fixed send queue delay helper.
- Normalized accidental double slash serial paths such as `//dev/...`.


### 0.1.21

- Extended device and capability catalogue
- Automatic device creation below `devices.*`
- Admin configuration for serial port, baud rate, dongle serial and debug options
- Partial update handling for incoming telegrams
- Protection against overwriting missing values
- Protection against unintended reset of `runningTime` to `0`
- Control states for pairing, unpairing, status broadcast and raw telegrams
- Control states for shutter, actuator, dimmer, sensor and thermostat classes

Older changelog entries are kept in [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License

MIT License

Copyright (c) 2026 iobroker-community-adapters
