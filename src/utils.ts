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

export function ramp(value: number, zeroVal: number, oneVal: number): number {
   return clamp((value - zeroVal) / (oneVal - zeroVal), 0, 1);
}

export function orThrow<T>(arg: T|undefined): T {
   if (typeof arg === 'undefined') {
      throw new Error('Argument is undefined');
   }
   return arg;
}

/**
 * A boolean who's state will remain true or false for a minimum
 * amount of time. Useful for debouncing noisy signals.
 */
export function stickyBool(initial: boolean, minTrueDurationS: number, minFalseDurationS: number) {
   let value = initial;
   let changePending = false;
   let lastChange = Date.now();
   return {
      set(newValue: boolean) {
         changePending = (newValue !== value);
      },
      get() {
         if (changePending) {
            const now = Date.now();
            const elapsedS = (now - lastChange) / 1000;
            const minDuration = value ? minTrueDurationS : minFalseDurationS;
            if (elapsedS >= minDuration) {
               value = !value;
               lastChange = now;
               changePending = false;
            }
         }
         return value;
      }
   }
}

export type StickyBool = ReturnType<typeof stickyBool>;

export class ProtectedBool {
   private value: boolean = false;

   constructor(initial: boolean) {
      this.value = initial;
   }

   update(newValue: boolean, trueAllowed: boolean) {
      if (!newValue) {
         this.value = false;
      } else if (trueAllowed) {
         this.value = true;
      }
   }

   get() {
      return this.value;
   }
}
