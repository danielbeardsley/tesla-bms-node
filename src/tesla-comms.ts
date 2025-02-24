import { SerialWrapper } from './serial-wrapper';
import { crc, sleep } from './utils';
import { BQRegisters } from './bms-board';

export const BROADCAST_ADDR = 0x3f;

export class TeslaComms {
   private serial: SerialWrapper;

   constructor(serialWrapper: SerialWrapper) {
      this.serial = serialWrapper;
   }

   async pollModule(number: number) {
      const sendData = [number << 1, 0, 1]; // bytes to send

      await this.serial.write(sendData);
      await sleep(40);
      const reply = await this.serial.readAll();

      if (reply.length > 4) {
         console.log('Found module #' + number + ': ', reply);
         return number;
      } else {
         return null;
      }
   }

   async readBytesFromDeviceRegister(device: number, register: number, byteCount: number) {
      var sendData = [device << 1, register, byteCount];

      // TODO: add CRC check, retry on failed, return as soon as all data received
      return this.serial.write(sendData).then(async () => {
         var data = await this.serial.readBytes(byteCount + 4);
         var checksum = crc(data.slice(0, byteCount + 3));
         if (data.length == byteCount + 4) {
            if (data[0] != sendData[0])
               throw 'first byte is ' + data[0] + ', not device id ' + device;
            if (data[1] != register)
               throw 'second byte is ' + data[1] + ', not register ' + register;
            if (data[2] != byteCount)
               throw 'third byte is ' + data[2] + ', not byte count ' + byteCount;
            if (data[data.length - 1] != checksum)
               throw 'last byte is ' + data[data.length - 1] + ', not expected crc ' + checksum;
            return data.slice(3, 3 + byteCount);
         } else
            throw (
               'readBytesFromDeviceRegister: Expected ' +
               (byteCount + 4) +
               ' bytes, got ' +
               data.length
            );
      });
   }

   async writeByteToDeviceRegister(device: number, register: number, byte: number) {
      var sendData = [(device << 1) | 1, register, byte];

      sendData.push(crc(sendData));
      this.serial.flushInput();
      return this.serial.write(sendData).then(async () => {
         const reply = await this.serial.readBytes(sendData.length);

         if (reply.length != sendData.length)
            throw (
               'writeByteToDeviceRegistr: Expected ' +
               sendData.length +
               ' bytes, got ' +
               reply.length
            );
         for (var i = 0; i < reply.length; i++)
            if (reply[i] != sendData[i])
               throw 'Expected byte ' + i + ' to be ' + sendData[i] + ', was ' + reply[i];
      });
   }
}