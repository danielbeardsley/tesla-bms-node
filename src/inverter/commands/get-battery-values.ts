import { generatePacket } from '../pylontech-packet';
import { ReturnCode } from '../pylontech-command';
import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from '../../logger';

type BatteryInfo = {
   cellVolts: number[];
   temperaturesC: number[];
   currentA: number; // positive is charging, negative is discharging
   voltage: number;
   cycleCount: number;
   totalCapacityAh: number;
   stateOfCharge: number;
}

export type GetBatteryValuesResponse = {
   infoFlag: number
   batteryNumber: number; // 1byte
   battery: BatteryInfo;
}

export default {
   Response: {
      generate: (address: number, data: GetBatteryValuesResponse): Buffer => {
         logger.verbose("Composing battery values packet %j", data);
         const out = new SmartBuffer();
         out.writeUInt8(data.infoFlag);
         out.writeUInt8(data.batteryNumber);
         outputBatteryInfo(out, data.battery);
         const packet = generatePacket(address, ReturnCode.Normal, out.toBuffer());
         logger.silly("Generated packet: %s", packet.toString());
         return packet;
      }
   }
}

function outputBatteryInfo(out: SmartBuffer, battery: BatteryInfo) {
   out.writeUInt8(battery.cellVolts.length);
   for (const cellVolt of battery.cellVolts) {
      out.writeUInt16BE(voltToPylonVolt(cellVolt));
   }
   // Protocol requires minimum of 5 temps
   // So repeat the last one
   extendArrayTo(battery.temperaturesC, 5);

   out.writeUInt8(battery.temperaturesC.length);
   for (const temp of battery.temperaturesC) {
      out.writeUInt16BE(tempCToPylonTemp(temp));
   }
   out.writeInt16BE(currentToPylonCurrent(battery.currentA));
   out.writeUInt16BE(voltToPylonVolt(battery.voltage));
   const defaultCapactiyAh = 60; // TODO: igure out why inverter can't handle the expanded protocol
   const remainScaled = battery.stateOfCharge * defaultCapactiyAh;
   const totalScaled = defaultCapactiyAh;
   logger.silly("Capacity %d/%d = %dpct", remainScaled.toFixed(1), totalScaled.toFixed(1), (battery.stateOfCharge * 100).toFixed(1));
   out.writeUInt16BE(remainScaled * 1000);
   out.writeUInt8(0x02);
   out.writeUInt16BE(totalScaled * 1000);
   out.writeUInt16BE(battery.cycleCount);
   /*
   out.writeUInt16BE(0xFFFF); // Ignored because remaining capacity sent in wider field
   out.writeUInt8(0x04); // Indicates remaining capaccity sent in wider field
   out.writeUInt16BE(0xFFFF); // Ignored because total capacity sent in wider field
   out.writeUInt16BE(battery.cycleCount);
   out.writeBuffer(capacityAhToPylonCapacity(battery.remainingCapacityAh));
   out.writeBuffer(capacityAhToPylonCapacity(battery.totalCapacityAh));
   */
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

function extendArrayTo<T>(arr: T[], length: number): T[] {
   const extended = arr.slice();
   const last = arr[arr.length - 1];
   for (let i = arr.length; i < length; i++) {
      extended.push(last);
   }
   return extended;
}

/**
 * Take in Amp hours and write a 3-byte buffer with the unsigned value in mAh
 *
function capacityAhToPylonCapacity(capacityAh: number): Buffer {
   const out = Buffer.alloc(4);
   out.writeUInt32BE(capacityAh * 1000, 0);
   return out.subarray(1);
}
*/