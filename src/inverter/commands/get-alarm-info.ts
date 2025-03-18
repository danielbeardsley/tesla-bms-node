import { generatePacket } from '../pylontech-packet';
import { ReturnCode } from '../pylontech-command';
import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from '../../logger';

type AlarmInfo = {
   cellVolts: AlarmState[];
   temperatures: AlarmState[];
   chargeCurrent: AlarmState;
   batteryVolts:  AlarmState;
   dischargeCurrent: AlarmState;
}

export enum AlarmState {
   Normal = 0,
   TooLow = 1,
   TooHigh = 2,
   Error = 0xF0,
}

export default {
   Response: {
      generate: (address: number, data: AlarmInfo): Buffer => {
         logger.verbose("Generting alarm values packet %j", data);
         const out = new SmartBuffer();
         out.writeUInt8(address); // "Command value"
         out.writeUInt8(data.cellVolts.length);
         data.cellVolts.forEach(cellAlarm => out.writeUInt8(cellAlarm));
         out.writeUInt8(data.temperatures.length);
         data.temperatures.forEach(tempAlarm => out.writeUInt8(tempAlarm));
         out.writeUInt8(data.chargeCurrent);
         out.writeUInt8(data.batteryVolts);
         out.writeUInt8(data.dischargeCurrent);
         // Not implemented yet
         out.writeUInt8(0); // Status bits 1
         out.writeUInt8(0); // Status bits 2
         out.writeUInt8(0); // Status bits 3
         out.writeUInt8(0); // Status bits 4
         out.writeUInt8(0); // Status bits 5
         return generatePacket(address, ReturnCode.Normal, out.toBuffer());
      }
   }
}