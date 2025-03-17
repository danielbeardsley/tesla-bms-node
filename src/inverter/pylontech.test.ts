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
   Responses: [
      /*
      // Get analog Values
      {
         frame:'~20024600F07A11020F0CC50CC30CC50CC40CC40CC60CC50CC40CC70CC50CC60CC60CC50CC60CC6050B370B230B230B2D0B2DFFE0BF8DFFFF04FFFF001B00BBE4012110E1D6\r',
         decoded: {}
      },
      */
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
   for (const testCase of testCases.Responses) {
      it('should decode a response frame', () => {
         const frame = Buffer.from(testCase.frame, 'ascii');
         const decoded = decodeFrame(frame);
         const decodedData = parsePacket(decoded);
         expect(decodedData).toEqual(testCase.decoded);
      });
   }
});