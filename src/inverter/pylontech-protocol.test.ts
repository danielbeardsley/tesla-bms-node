import { describe, it, expect } from 'vitest';
import { parseRequest } from './pylontech-protocol';

describe('parseRequest', () => {
    it('should parse a valid request', () => {
        const buffer = Buffer.from("~01AB00~");
        const result = parseRequest(buffer);
        expect(result).toEqual({
            startByte: 0x7E,
            address: 1,
            command: "AB",
            datalength: 0,
            data: Buffer.alloc(0),
            endByte: 0x7E
        });
    });

    it('should parse a valid request with data', () => {
        const buffer = Buffer.from("~01AB01D~");
        const result = parseRequest(buffer);
        expect(result).toEqual({
            startByte: 0x7E,
            address: 1,
            command: "AB",
            datalength: 1,
            data: Buffer.from("D"),
            endByte: 0x7E
        });
    });

    it('should throw an error for an invalid request buffer', () => {
        // missing end byte
        expect(() => parseRequest(Buffer.from("~01AB00"))).toThrow();
        // missing start byte
        expect(() => parseRequest(Buffer.from("~01AB00"))).toThrow();
        // non-acii number
        expect(() => parseRequest(Buffer.from("~XXAB00~"))).toThrow();
    });
});