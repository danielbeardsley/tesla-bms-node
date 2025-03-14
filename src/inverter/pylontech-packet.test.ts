import { describe, it, expect } from 'vitest';
import { generatePacket, parsePacket } from './pylontech-packet';
import { Command } from './pylontech-command';

describe('parsePacket', () => {
    it('should parse a valid packet', () => {
        const buffer = Buffer.from("200146420000");
        const result = parsePacket(buffer);
        expect(result).toEqual({
            version: 32,
            address: 1,
            command: 0x42,
            datalength: 0,
            data: Buffer.alloc(0),
            lengthChecksum: 0,
        });
    });

    it('should parse a valid packet with data', () => {
        const buffer = Buffer.from("20014643F001D");
        const result = parsePacket(buffer);
        expect(result).toEqual({
            version: 32,
            address: 1,
            command: 0x43,
            datalength: 1,
            data: Buffer.from("D"),
            lengthChecksum: 15,
        });
    });

    it('should parse but not care about the length checksum', () => {
        const buffer = Buffer.from("200146438000");
        const result = parsePacket(buffer);
        expect(result).toEqual({
            version: 32,
            address: 1,
            command: 0x43,
            datalength: 0,
            data: Buffer.alloc(0),
            lengthChecksum: 8, // The value from the packet, but it's not the right checksum
        });
    });

    it('should throw an error for invalid packets', () => {
        // non-acii number
        expect(() => parsePacket(Buffer.from("XXAB00"))).toThrow();
        // data(0) < length(16)
        expect(() => parsePacket(Buffer.from("20014643800F"))).toThrow();
        // data(2) > length(0)
        expect(() => parsePacket(Buffer.from("200146438000FF"))).toThrow();
        // non-hex bytes
        expect(() => parsePacket(Buffer.from("2001XX438000FF"))).toThrow();
    });
});

describe('generatePacket', () => {
    it('should generate a valid packet with empty data', () => {
        const expected = Buffer.from("200146420000");
        const result = generatePacket(1, Command.GetBatteryValues, Buffer.alloc(0));
        assertSameBuffer(expected, result);
    });

    it('should generate a valid packet with no data arg', () => {
        const expected = Buffer.from("200146420000");
        const result = generatePacket(1, Command.GetBatteryValues);
        assertSameBuffer(expected, result);
    });

    it('should generate a valid packet with data', () => {
        const expected = Buffer.from("20014651F001D");
        const result = generatePacket(1, Command.GetManfuacturerInfo, Buffer.from("D"));
        assertSameBuffer(expected, result);
    });

    it('should throw an error for an invalid packet', () => {
        // data too long
        expect(() => generatePacket(1, Command.GetBatteryValues, Buffer.from("X".repeat(4096)))).toThrow();
    });
});

function assertSameBuffer(expected: Buffer, value: Buffer) {
    expect(value.toString()).toEqual(expected.toString());
}