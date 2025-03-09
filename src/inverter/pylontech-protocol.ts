import { Parser } from 'binary-parser';

export enum Command {
   GetBatteryStatus = "FB",
   GetCellVoltages = "FV",
   GetBatteryAlarms = "FW",
}

export const Request = new Parser()
.uint8('startByte', { assert: 0x7E })
.string('address', asciiNumber(2))
.string('command', hexString(4))
.string('datalength', asciiNumber(2))
.buffer('data', { length: 'datalength' })
.uint8('endByte', { assert: 0x7E })

export function parseRequest(buffer: Buffer) {
    return Request.parse(buffer);
}

function asciiNumber(bytes: number) {
   return {
      length: bytes,
      formatter: (str: string) => parseInt(str, 10),
      assert: (str: string|number) => typeof str == 'string' && /^[0-9]+$/.test(str),
   };
}

/**
 * Will take something like "4642" and read it as 0x46, 0x42
 * and then interpret those bytes as a string => "FB"
 */
function hexString(length: number) {
   return {
      length: length,
      formatter: (str: string) => Buffer.from(str, 'hex').toString('ascii'),
      assert: (str: string|number) => typeof str == 'string' && /^[0-9A-B]+$/.test(str),
   };
}