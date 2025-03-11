import { describe, it, expect } from 'vitest';
import { parsePacket } from './pylontech-packet';

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