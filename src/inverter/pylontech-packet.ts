import { Parser } from 'binary-parser';

export enum Command {
   GetBatteryStatus = "FB",
   GetCellVoltages = "FV",
   GetBatteryAlarms = "FW",
}

export const packetParser = new Parser()
.string('address', asciiNumber(2)) // 2 bytes of a base-10 number encoded as ascii like "01"
.string('command', hexString(4)) // 4 bytes of hex encoded as ascii like "4642" -> "0x46, 0x42" -> "FB"
.string('lengthChecksum', hexNumber(1)) // 1 bytes of a hex-encoded checksum on the length field
.string('datalength', hexNumber(3)) // 3 bytes of a hex-encoded length
.buffer('data', { length: 'datalength' })
.buffer('_extra', { length: 1 }) // We always expect this to be empty, indicating there's no extra data

export function parsePacket(buffer: Buffer) {
   const packet = packetParser.parse(buffer);
   if (packet.data.length !== packet.datalength) {
      throw new Error('Data length does not match length field');
   }
   if (packet._extra.length !== 0) {
      throw new Error('Extra data found at end of packet');
   }
   delete packet._extra;
   return packet;
}

export function generatePacket(address: number, command: Command, data: Buffer) {
   if (data.length > 0xfff) {
      throw new Error('Data too long');
   }
   return Buffer.concat([
      Buffer.from(address.toString().padStart(2, '0')),
      stringToHexBuffer(command),
      Buffer.from(lengthChecksum(data.length)),
      data,
   ]);
}

/**
 * Computes the checksum for the *length* value
 * and returns 4-byte string composed of 1 hex char
 * for the checksum of the length followed by 3 hex chars for the length
 */
function lengthChecksum(length: number) {
   if (length > 0xFFF) {
      throw new Error('Packet data too long, must be less than 4096 bytes');
   }
   let sum = (length & 0x0F) +
               ((length >> 4) & 0x0F) +
               ((length >> 8) & 0x0F);

   sum = (~(sum % 16) + 1) & 0x0F; // Modulo 16, invert bits, add one

   // Format sum and payloadLen as hex strings
   return sum.toString(16).toUpperCase() +
      length.toString(16).toUpperCase().padStart(3, '0');
}

function hexNumber(bytes: number) {
   return {
      length: bytes,
      formatter: (str: string) => parseInt(str, 16),
      assert: (str: string|number) => typeof str == 'string' && isHexString(str),
   };
}

function asciiNumber(bytes: number) {
   return {
      length: bytes,
      formatter: (str: string) => parseInt(str, 10),
      assert: (str: string|number) => typeof str == 'string' && isIntString(str),
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
      assert: (str: string|number) => typeof str == 'string' && isHexString(str),
   };
}

function stringToHexBuffer(str: string): Buffer {
   return Buffer.from(Buffer.from(str, 'ascii').toString('hex'));
}

function isHexString(str: string): boolean {
   return /^[0-9A-F]+$/.test(str);
}

function isIntString(str: string): boolean {
   return /^[0-9]+$/.test(str);
}