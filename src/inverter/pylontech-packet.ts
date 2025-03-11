import { Parser } from 'binary-parser';

export enum Command {
   GetBatteryStatus = "FB",
   GetCellVoltages = "FV",
   GetBatteryAlarms = "FW",
}

export const packetParser = new Parser()
.string('address', asciiNumber(2)) // 2 bytes of a base-10 number encoded as ascii like "01"
.string('command', hexString(4)) // 4 bytes of hex encoded as ascii like "4642" -> "0x46, 0x42" -> "FB"
.string('datalength', asciiNumber(2)) // 2 bytes of a base-10 number encoded as ascii like "64"
.buffer('data', { length: 'datalength' })

export function parsePacket(buffer: Buffer) {
    return packetParser.parse(buffer);
}

export function generatePacket(address: number, command: Command, data: Buffer) {
   if (data.length > 100) {
      throw new Error('Data too long');
   }
   return Buffer.concat([
      Buffer.from(address.toString().padStart(2, '0')),
      stringToHexBuffer(command),
      Buffer.from(data.length.toString().padStart(2, '0')),
      data,
   ]);
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

function stringToHexBuffer(str: string): Buffer {
   return Buffer.from(Buffer.from(str, 'ascii').toString('hex'));
}