import { describe, it, expect } from 'vitest';
import { Command, generatePacket, parsePacket } from './pylontech-packet';


describe('parsePacket', () => {
    it('should parse a valid packet', () => {
        const buffer = Buffer.from("01464200");
        const result = parsePacket(buffer);
        expect(result).toEqual({
            address: 1,
            command: "FB",
            datalength: 0,
            data: Buffer.alloc(0),
        });
    });

    it('should parse a valid packet with data', () => {
        const buffer = Buffer.from("01464301D");
        const result = parsePacket(buffer);
        expect(result).toEqual({
            address: 1,
            command: "FC",
            datalength: 1,
            data: Buffer.from("D"),
        });
    });

    it('should throw an error for an invalid packet', () => {
        // non-acii number
        expect(() => parsePacket(Buffer.from("XXAB00"))).toThrow();
    });
});

describe('generatePacket', () => {
    it('should generate a valid packet', () => {
        const buffer = Buffer.from("01464200");
        const result = generatePacket(1, Command.GetBatteryStatus, Buffer.alloc(0));
        expect(result).toEqual(buffer);
    });

    it('should parse a valid packet with data', () => {
        const buffer = Buffer.from("01465601D");
        const result = generatePacket(1, Command.GetCellVoltages, Buffer.from("D"));
        expect(result).toEqual(buffer);
    });

    it('should throw an error for an invalid packet', () => {
        // data too long
        expect(() => generatePacket(1, Command.GetBatteryStatus, Buffer.from("X".repeat(101)))).toThrow();
    });
});