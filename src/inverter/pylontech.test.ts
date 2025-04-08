import { describe, it, expect } from 'vitest';
import { parsePacket } from './pylontech-packet';
import { decodeFrame } from './pylontech-frame';
import { Command } from './pylontech-command';

const testCases = {
   Requests: [
      {frame: '~20024642E00202FD33\r', decoded: {
         "version": 32,
         "address": 2,
         "command": Command.GetBatteryValues,
         "data": Buffer.from([2]),
         "lengthChecksum": 14,
         "datalength": 2,
       }},
      {frame: '~20034693E00203FD2B\r', decoded: {
         "version": 32,
         "address": 3,
         "command": Command.GetSerialNumber,
         "data": Buffer.from([3]),
         "lengthChecksum": 14,
         "datalength": 2,
       }},
      {frame: '~20024642E00202FD33\r', decoded: {
         "version": 32,
         "address": 2,
         "command": Command.GetBatteryValues,
         "data": Buffer.from([2]),
         "lengthChecksum": 14,
         "datalength": 2,
       }},
      {frame: '~20024693E00202FD2D\r', decoded:  {
         "version": 32,
         "address": 2,
         "command": Command.GetSerialNumber,
         "data": Buffer.from([2]),
         "lengthChecksum": 14,
         "datalength": 2,
       }},
   ],
};

describe('Pylontech Protocol', () => {
   for (const testCase of testCases.Requests) {
      it('should decode a request frame', () => {
         const frame = Buffer.from(testCase.frame, 'ascii');
         const decoded = decodeFrame(frame);
         const decodedData = parsePacket(decoded);
         expect(decodedData).toEqual(testCase.decoded);
      });
   }
});
