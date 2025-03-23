export function sleep(ms: number) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

export function crc(data: number[]): number {
   const generator = 0x07;
   const finalCRC = data.reduce((crc, byte) => {
      crc = crc ^ byte;
      for (let i = 0; i < 8; i++) {
         if ((crc & 0x80) !== 0) crc = ((crc << 1) & 0xff) ^ generator;
         else crc = (crc << 1) & 0xff;
      }
      return crc;
   }, 0x00);

   return finalCRC;
}

export function bytesToUint16s(bytes: number[]) {
   return bytes.reduce((acc, byte, index) => {
      if (index % 2 === 0) {
         acc.push((byte << 8) + bytes[index + 1]);
      }
      return acc;
   }, [] as number[]);
}


export function clamp(value: number, min: number, max: number) {
   return Math.min(Math.max(value, min), max);
}