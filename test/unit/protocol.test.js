'use strict';
const assert = require('node:assert');
const p = require('../../lib/protocol');

describe('lib/protocol', () => {
    it('builds stick frames', () => {
        assert.strictEqual(p.isHex44(p.constants.duoACK), true, 'ACK must be a valid 44 hex telegram');
        assert.strictEqual(p.buildRemotePairStick('40ABCD'), '0D010601000000000000000000000000000040ABCD00');
        assert.strictEqual(p.buildStatusRequest('406B2D'), '0DFF0F400000000000000000000000000000406B2D01');
    });

    it('parses device code lists and FHEM define lines', () => {
        assert.deepStrictEqual(p.parseDeviceCodes('406B2D, 4090AE 43ABCD01'), ['406B2D', '4090AE', '43ABCD01']);
        assert.deepStrictEqual(
            p.parseDeviceCodes(
                'define Rademacher DUOFERNSTICK /dev/ttyUSB0@115200 6F1A6F\ndefine WZ_Rollo DUOFERN 406B2D\ndefine Steckdose DUOFERN 43ABCD01',
            ),
            ['406B2D', '43ABCD01'],
        );
    });

    it('builds device commands', () => {
        assert.strictEqual(p.buildDeviceCommand('406B2D', 'up')[0], '0D0107010000000000000000000000ZZZZZZ406B2D00');
        assert.strictEqual(p.buildDeviceCommand('406B2D', 'position', 42)[0], '0D010707002A000000000000000000ZZZZZZ406B2D00');
        assert.strictEqual(
            p.buildDeviceCommand('406B2D', 'position', 42, { positionInverse: true })[0],
            '0D010707002A000000000000000000ZZZZZZ406B2D00',
            'position command must stay identical to the raw position value',
        );
        assert.throws(() => p.buildDeviceCommand('406B2D', 'position', 101));
    });

    it('parses ACK frames and extracts device codes', () => {
        assert.strictEqual(p.parseTelegram(p.constants.duoACK, '6FEDCB').isAck, true);
        assert.strictEqual(p.extractDeviceCode('0FFF0F210000000000000025000000406B2DFFFFFF01', '6FEDCB'), '406B2D');
    });

    it('decodes status frames from the format byte at offset 6', () => {
        const statusWithGroup = `0FFF0F210000000000000025000000406B2DFFFFFF01`;
        assert.strictEqual(statusWithGroup.length, 44);
        const decoded = p.decodeStatusTelegram(statusWithGroup, '406B2D', '01');
        assert.strictEqual(decoded.group, '21');
        assert.strictEqual(decoded.payloadStart, 6);
        assert.strictEqual(decoded.statusFrame, true);
        assert.strictEqual(decoded.readings.position, 37);

        const decoded23a = p.decodeStatusTelegram('0FFF0F230000000000000040000000' + '47ABCD' + 'FFFFFF01', '47ABCD', '01');
        assert.strictEqual(decoded23a.group, '23A');
        assert.strictEqual(decoded23a.payloadStart, 6);
    });

    it('never decodes values from non-status frames', () => {
        const decoded = p.decodeStatusTelegram('0F010701000000000000000000000000406B2D000000', '406B2D', '01');
        assert.strictEqual(decoded.statusFrame, false);
        assert.deepStrictEqual(decoded.readings, {});
    });

    it('resolves a profile for every supported device prefix', () => {
        const prefixes = ['40', '41', '42', '43', '46', '47', '48', '49', '4A', '4B', '4C', '4E', '61', '62', '65', '69', '70', '71', '73', '74'];
        prefixes.push('A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A7', 'A8', 'A9', 'AA', 'AB', 'AC', 'AD', 'AF', 'E0', 'E1');
        for (const prefix of prefixes) {
            assert.notStrictEqual(p.deviceClass(`${prefix}ABCD`), 'unknown', `device prefix ${prefix} must be recognized`);
        }
    });

    it('limits commands to the device profile', () => {
        assert.strictEqual(p.deviceCommandProfile('42ABCD').profile, 'venetianBlinds');
        assert.strictEqual(p.commandSupportedByDevice('42ABCD', 'slatPosition'), true);
        assert.strictEqual(p.commandSupportedByDevice('4BABCD', 'slatPosition'), true);
        assert.strictEqual(p.commandSupportedByDevice('62ABCD', 'position'), true);
        assert.strictEqual(p.commandSupportedByDevice('65ABCD', 'position'), false);
        assert.strictEqual(p.commandSupportedByDevice('74ABCD', 'position'), false);
        assert.strictEqual(p.commandSupportedByDevice('71ABCD', 'on'), true);
        assert.strictEqual(p.commandSupportedByDevice('4AABCD', 'level'), true);
    });
});
