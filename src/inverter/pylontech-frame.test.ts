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

    it('should decode a frame with a carriage return end byte', () => {
        const result = decodeFrame(Buffer.from("~123ABCFEA4\r"));
        expect(result).toEqual(Buffer.from("123ABC"));
    });

    it('should throw an error for an invalid request buffer', () => {
        // missing start byte
        expect(() => decodeFrame(Buffer.from("123ABCFEA4~"))).toThrow();
        // missing end byte
        expect(() => decodeFrame(Buffer.from("~123ABCFEA4"))).toThrow();
        // too short
        expect(() => decodeFrame(Buffer.from("~00~"))).toThrow();
        // incorrect checksum
        expect(() => decodeFrame(Buffer.from("~123ABC0000~"))).toThrow();
        // checksum with non-hex characters
        expect(() => decodeFrame(Buffer.from("~123ABC____~"))).toThrow();
    });
});

describe('encodeFrame', () => {
   it('should encode an empty frame', () => {
      const result = encodeFrame(Buffer.alloc(0));
      expect(result).toEqual(Buffer.from("~0000\r"));
   });

   it('should encode a frame with data', () => {
      const result = encodeFrame(Buffer.from("123ABC"));
      expect(result).toEqual(Buffer.from("~123ABCFEA4\r"));
   });

   it('should handle long frames', () => {
      const result = encodeFrame(Buffer.from("asdlfkjawefwiafjoi4jfqoi34fjwlefjaliejfaw"));
      expect(result).toEqual(Buffer.from("~asdlfkjawefwiafjoi4jfqoi34fjwlefjaliejfawEFB6\r"));
   });
});