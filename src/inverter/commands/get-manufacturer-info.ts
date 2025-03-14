import { generatePacket, toHex, strToHexSized } from '../pylontech-packet';
import { Command } from '../pylontech-command';

export type GetManufacturerInfoResponse = {
   batteryName: string;
   softwareVersion: number;
   manufacturerName: string;
}

export const Response = {
   generate: (address: number, data: GetManufacturerInfoResponse): Buffer => {
      const dataBuffer = Buffer.from(
         strToHexSized(data.batteryName, 10) +
         toHex(data.softwareVersion, 2) +
         strToHexSized(data.manufacturerName, 20)
      );

      if (dataBuffer.length !== 64) {
         throw new Error('Data length must be 64 bytes');
      }
      return generatePacket(address, Command.GetManfuacturerInfo, dataBuffer)
   }
}