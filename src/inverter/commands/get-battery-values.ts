import { generatePacket } from '../pylontech-packet';
import { Command } from '../pylontech-command';

type BatteryInfo = {
   cellVolts: number[];
   temperatures: number[];
   current: number; // positive is charging, negative is discharging
}

export type GetBatteryValuesResponse = {
   infoFlag: number
   commandValue: number; // 1byte
   batteries: Array<BatteryInfo>;
}

export const Response = {
   generate: (address: number, data: GetManufacturerInfoResponse): Buffer => {
      const buffer = Buffer.alloc(32);
      buffer.write(limitAndPad(data.batteryName, 10), 0, 10, 'utf8');
      buffer.writeInt16LE(data.softwareVersion, 10);
      buffer.write(limitAndPad(data.manufacturerName, 20), 12, 20, 'utf8');

      return generatePacket(address, Command.GetManfuacturerInfo, buffer);
   }
}

function limitAndPad(str: string, length: number) {
   return str.substring(0, length).padEnd(length, ' ');
}