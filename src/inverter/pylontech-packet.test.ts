import { describe, it, expect } from 'vitest';
import { parseRequest } from './pylontech-protocol';

describe('parseRequest', () => {
    it('should parse a valid request', () => {
        const buffer = Buffer.from("01464200");
        const result = parseRequest(buffer);
        expect(result).toEqual({
            address: 1,
            command: "FB",
            datalength: 0,
            data: Buffer.alloc(0),
        });
    });

    it('should parse a valid request with data', () => {
        const buffer = Buffer.from("01464301D");
        const result = parseRequest(buffer);
        expect(result).toEqual({
            address: 1,
            command: "FC",
            datalength: 1,
            data: Buffer.from("D"),
        });
    });

    it('should throw an error for an invalid request buffer', () => {
        // non-acii number
        expect(() => parseRequest(Buffer.from("XXAB00"))).toThrow();
    });
});