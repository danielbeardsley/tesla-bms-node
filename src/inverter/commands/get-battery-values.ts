import { generatePacket } from '../pylontech-packet';
import { ReturnCode } from '../pylontech-command';
import { SmartBuffer } from 'smart-buffer';

type BatteryInfo = {
   cellVolts: number[];
   temperaturesC: number[];
   currentA: number; // positive is charging, negative is discharging
   voltage: number;
   cycleCount: number;
   totalCapacityAh: number;
   remainingCapacityAh: number;
}

export type GetBatteryValuesResponse = {
   infoFlag: number
   batteryNumber: number; // 1byte
   battery: BatteryInfo;
}

export const Response = {
   generate: (address: number, data: GetBatteryValuesResponse): Buffer => {
      const out = new SmartBuffer();
      out.writeUInt8(data.infoFlag);
      out.writeUInt16BE(data.batteryNumber);
      outputBatteryInfo(out, data.battery);
      return generatePacket(address, ReturnCode.Normal, out.toBuffer());
   }
}

function outputBatteryInfo(out: SmartBuffer, battery: BatteryInfo) {
   out.writeUInt8(battery.cellVolts.length);
   for (const cellVolt of battery.cellVolts) {
      out.writeUInt16BE(voltToPylonVolt(cellVolt));
   }
   out.writeUInt8(battery.temperaturesC.length);
   for (const temp of battery.temperaturesC) {
      out.writeUInt16BE(tempCToPylonTemp(temp));
   }
   out.writeUInt16BE(currentToPylonCurrent(battery.currentA));
   out.writeUInt16BE(voltToPylonVolt(battery.voltage));
   out.writeUInt16BE(0xFFFF); // Ignored because remaining capacity sent in wider field
   out.writeUInt8(0x04); // Indicates remaining capaccity sent in wider field
   out.writeUInt16BE(0xFFFF); // Ignored because total capacity sent in wider field
   out.writeUInt16BE(battery.cycleCount);
   out.writeBuffer(capacityAhToPylonCapacity(battery.remainingCapacityAh));
   out.writeBuffer(capacityAhToPylonCapacity(battery.totalCapacityAh));
}

function tempCToPylonTemp(temp: number) {
   return Math.round(temp * 10 + 2731);
}

function voltToPylonVolt(volt: number) {
   return Math.round(volt * 1000);
}

function currentToPylonCurrent(current: number) {
   return Math.round(current * 10);
}

/**
 * Take in Amp hours and write a 3-byte buffer with the unsigned value in mAh
 */
function capacityAhToPylonCapacity(capacityAh: number): Buffer {
   const out = Buffer.alloc(4);
   out.writeUInt32BE(capacityAh * 1000, 0);
   return out.subarray(1);
}