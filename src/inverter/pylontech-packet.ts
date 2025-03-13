import { Parser } from 'binary-parser';
import type { Command } from './pylontech-command';

export type Packet = {
   version: number;
   address: number;
   command: string;
   lengthChecksum: number;
   datalength: number;
   data: Buffer;
}

const PYLONTECH_VERSION = 0x20;

const CID1 = 0x46;

export const packetParser = new Parser()
.string('version', hexNumber(2)) // 2 bytes of a hex-encoded version number
.string('address', hexNumber(2)) // 2 bytes of a hex-encoded device address
.string('cid1', hexNumber(2)) // 2 bytes of hex encoded "control identify code", always 0x46
.string('command', hexNumber(2)) // 2 bytes of hex encoded as ascii like "42" -> 0x42 -> 66
.string('lengthChecksum', hexNumber(1)) // 1 bytes of a hex-encoded checksum on the length field
.string('datalength', hexNumber(3)) // 3 bytes of a hex-encoded length
.buffer('data', { length: 'datalength' })
.buffer('_extra', { length: 1 }) // We always expect this to be empty, indicating there's no extra data

export function parsePacket(buffer: Buffer): Packet {
   const packet = packetParser.parse(buffer);
   if (packet.data.length !== packet.datalength) {
      throw new Error('Data length does not match length field, expected ' + packet.datalength + ' but got ' + packet.data.length);
   }
   if (packet._extra.length !== 0) {
      throw new Error('Extra data found at end of packet');
   }
   delete packet._extra;
   delete packet.cid1;
   return packet;
}

export function generatePacket(address: number, command: Command, data: Buffer) {
   if (data.length > 0xfff) {
      throw new Error('Data too long');
   }
   return Buffer.concat([
      Buffer.from(toHex(PYLONTECH_VERSION, 2)),
      Buffer.from(toHex(address, 2)),
      Buffer.from(toHex(CID1, 2)),
      Buffer.from(toHex(command, 2)),
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

function toHex(num: number, length: number): string {
   return num.toString(16).toUpperCase().padStart(length, '0');
}

function isHexString(str: string): boolean {
   return /^[0-9A-F]+$/.test(str);
}