import { SmartBuffer } from 'smart-buffer';
import type { Command, ReturnCode } from './pylontech-command';
import { inverterLogger as logger } from '../logger';

export type Packet = {
   version: number;
   address: number;
   command: number;
   lengthChecksum: number;
   datalength: number;
   data: Buffer;
}

const PYLONTECH_VERSION = 0x20;

const CID1 = 0x46;

export function parsePacket(buffer: Buffer): Packet {
   logger.silly('Parsing packet: %j', buffer);
   if (!isHexString(buffer.toString())) {
      throw new Error('Buffer is not a hex string');
   }

   const binary = Buffer.from(buffer.toString(), 'hex');
   const reader = SmartBuffer.fromBuffer(binary);

   const version        = reader.readUInt8();
   const address        = reader.readUInt8();
                          reader.readUInt8(); // cid1, always 0x46, ignored
   const command        = reader.readUInt8();
   const lengthField    = reader.readUInt16BE();
   const lengthChecksum = (lengthField & 0xF000) >> 12;
   const datalength     = lengthField & 0x0FFF;
   const data           = reader.readBuffer(Math.ceil(datalength / 2));

   if (data.length * 2 !== datalength) {
      throw new Error('Data length does not match length field, expected ' + datalength + ' but got ' + data.length * 2);
   }
   if (reader.remaining() > 0) {
      throw new Error('Extra data found at end of packet: ' + reader.remaining() + ' bytes');
   }
   const parsedPacket = {
      version,
      address,
      command,
      lengthChecksum,
      datalength,
      data,
   };
   logger.debug('Parsed packet: %j', parsedPacket);
   return parsedPacket;
}

export function generatePacket(address: number, command: Command|ReturnCode, data?: Buffer) {
   data = data || Buffer.alloc(0);
   logger.silly('Generating packet with data: %j', data);
   if (data.length > 0xfff) {
      throw new Error('Data too long');
   }
   return Buffer.concat([
      Buffer.from(toHex(PYLONTECH_VERSION, 2)),
      Buffer.from(toHex(address, 2)),
      Buffer.from(toHex(CID1, 2)),
      Buffer.from(toHex(command, 2)),
      Buffer.from(lengthChecksum(data.length * 2)), // bytes * 2 cause it ends up encoded as hex chars
      Buffer.from(bufferToHex(data)),
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

export function toHex(num: number, length: number): string {
   if (num >= Math.pow(16, length)) {
      throw new Error(`Number (${num}) too large to be represented by ${length} hex chars`);
   }
   return num.toString(16).toUpperCase().padStart(length, '0');
}

export function bufferToHex(buffer: Buffer): string {
   return buffer.toString('hex').toUpperCase();
}

export function strToHexSized(str: string, size: number): string {
   const paddedStr = str.substring(0, size).padEnd(size, ' ');
   return Buffer.from(paddedStr).toString('hex').toUpperCase();
}

function isHexString(str: string): boolean {
   return /^[0-9A-F]+$/.test(str);
}