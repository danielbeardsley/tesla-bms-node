import { SerialWrapper } from './serial-wrapper';
import { crc } from '../utils';
import { Registers } from './tesla-module';

export const BROADCAST_ADDR = 0x3f;
export const RESET_VALUE = 0xa5;

export class TeslaComms {
   private serial: SerialWrapper;

   constructor(serialWrapper: SerialWrapper) {
      this.serial = serialWrapper;
   }

   async close() {
      await this.serial.close();
   }

   async renumberModules(maxModules: number): Promise<number> {
      // Reset all of the addresses to 0x00
      await this.writeByteToDeviceRegister(BROADCAST_ADDR, Registers.REG_RESET, RESET_VALUE);

      let nextAddress = 1;

      // Read the status register at address zero, then assign an address until no more are left
      try {
         for (let i = 0; i < maxModules; i++) {
            console.debug(`Trying next module...`);
            await this.readBytesFromDeviceRegister(0x00, Registers.REG_DEV_STATUS, 1);
            console.debug(`Module found, assigning address ${nextAddress}`);
            await this.writeByteToDeviceRegister(0x00, Registers.REG_ADDR_CTRL, nextAddress | 0x80);

            // Read from the new address to make sure it works
            await this.readBytesFromDeviceRegister(nextAddress, Registers.REG_ADDR_CTRL, 1);
            nextAddress++;
         }
      } catch {
         console.debug(`Didn't find module ${nextAddress}, stopping renumbering`);
      }
      return nextAddress - 1;
   }

   async isModuleAlive(number: number): Promise<boolean> {
      return this.readBytesFromDeviceRegister(number, Registers.REG_DEV_STATUS, 1, 40)
         .then(() => true)
         .catch(() => false);
   }

   async readBytesFromDeviceRegister(
      device: number,
      register: number,
      byteCount: number,
      timeout: number = 100
   ) {
      const sendData = [device << 1, register, byteCount];

      // TODO: add CRC check, retry on failed, return as soon as all data received
      return this.serial.write(sendData).then(async () => {
         const data = await this.serial.readBytes(byteCount + 4, timeout);
         // Saw this in other implementations, not sure why
         data[0] = data[0] & 0b01111111;
         const checksum = crc(data.slice(0, byteCount + 3));
         if (data.length === byteCount + 4) {
            if (data[0] !== sendData[0])
               throw new Error(`first byte is ${data[0]}, not device id ${device}`);
            if (data[1] !== register)
               throw new Error(`second byte is ${data[1]}, not register ${register}`);
            if (data[2] !== byteCount)
               throw new Error(`third byte is ${data[2]}, not byte count ${byteCount}`);
            if (data[data.length - 1] !== checksum)
               throw new Error(
                  `last byte is ${data[data.length - 1]}, not expected crc ${checksum}`
               );
            return data.slice(3, 3 + byteCount);
         } else
            throw new Error(
               `readBytesFromDeviceRegister: Expected ${byteCount + 4} bytes, got ${data.length}`
            );
      });
   }

   async writeByteToDeviceRegister(device: number, register: number, byte: number) {
      const sendData = [(device << 1) | 1, register, byte];

      sendData.push(crc(sendData));
      this.serial.flushInput();
      return this.serial.write(sendData).then(async () => {
         const reply = await this.serial.readBytes(sendData.length);
         // Saw this in other implementations, not sure why
         reply[0] = reply[0] & 0b01111111;

         if (reply.length !== sendData.length)
            throw new Error(
               `writeByteToDeviceRegistr: Expected ${sendData.length} bytes, got ${reply.length}`
            );
         for (let i = 0; i < reply.length; i++)
            if (reply[i] !== sendData[i])
               throw new Error(`Expected byte ${i} to be ${sendData[i]}, was ${reply[i]}`);
      });
   }
}
