import { describe, it, expect } from 'vitest';
import { decodeFrame, encodeFrame } from './pylontech-frame';

describe('decodeFrame', () => {
    it('should decode an empty frame', () => {
        const result = decodeFrame(Buffer.from("~0000~"));
        expect(result).toEqual(Buffer.alloc(0));
    });

    it('should decode a frame with data', () => {
        const result = decodeFrame(Buffer.from("~123ABCFEA4~"));
        expect(result).toEqual(Buffer.from("123ABC"));
    });

    it('should throw an error for an invalid request buffer', () => {
        // missing start byte
        expect(() => decodeFrame(Buffer.from("01AB00"))).toThrow();
        // missing end byte
        expect(() => decodeFrame(Buffer.from("~01AB00~"))).toThrow();
        // too short
        expect(() => decodeFrame(Buffer.from("~00~"))).toThrow();
        // bad checksum
        expect(() => decodeFrame(Buffer.from("~XX0000~"))).toThrow();
    });
});