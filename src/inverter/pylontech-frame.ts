/**
 * Takes in a buffer of shape "~{data}{checksum}~" and returns the data
 * part if the checksum is valid. Otherwise, throws an error.
 */
export function decodeFrame(buffer: Buffer) {
   if (buffer[0] != 0x7E) {
      throw new Error('Invalid start byte');
   }
   const endByte = buffer[buffer.length - 1];
   if (endByte != 0x7E && endByte != 0x0D) {
      throw new Error('Invalid end byte, expecting 0x7E or 0x0D but got 0x' + endByte.toString(16));
   }

   const data = buffer.subarray(1, -5);
   const checksum = buffer.subarray(-5, -1).toString('ascii');

   if (hexChecksum(data) !== checksum) {
      throw new Error('Invalid checksum, expected ' + hexChecksum(data) + ' but got ' + checksum);
   }
   return data;
}

/**
 * Takes in a buffer of data and returns a buffer of shape
 * "~{data}{checksum}~" for writing directly to an RS485 serial line.
 */
export function encodeFrame(data: Buffer) {
   return concatBuffers([
      '~', data, hexChecksum(data), '~',
   ]);
}

// Computes the checksum for a frame of data and returns the checksum
// as a 4-character uppercase hex string. This is exactly how its
// represented in the pylon protocol.
function hexChecksum(frame: Buffer): string {
   let sum = 0;

   for (const byte of frame) {
      sum += byte;
   }

   sum = (~sum + 1) & 0xFFFF; // Ensure it's a positive 16-bit value

   const buffer = Buffer.alloc(2);
   buffer.writeUInt16BE(sum, 0);
   return buffer.toString('hex').toUpperCase();
}

// concatenates strings and buffers into a single buffer
function concatBuffers(parts: Array<Buffer|string>): Buffer {
   const buffers = parts.map(part => Buffer.isBuffer(part) ? part : Buffer.from(part));
   return Buffer.concat(buffers);
}