import { generatePacket } from '../pylontech-packet';
import { ReturnCode } from '../pylontech-command';
import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from '../../logger';

export type GetManufacturerInfoResponse = {
   batteryName: string;
   softwareVersion: number;
   manufacturerName: string;
}

export const Response = {
   generate: (address: number, data: GetManufacturerInfoResponse): Buffer => {
      logger.verbose("Generting manufacturer info packet %j", data);
      const b = new SmartBuffer();
      b.writeString(limitAndPad(data.batteryName, 10))
      b.writeUInt16BE(data.softwareVersion)
      b.writeString(limitAndPad(data.manufacturerName, 20))

      return generatePacket(address, ReturnCode.Normal, b.toBuffer());
   }
}

function limitAndPad(str: string, length: number) {
   return str.substring(0, length).padEnd(length, ' ');
}