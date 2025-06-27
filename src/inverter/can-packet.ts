import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from "../logger";
import { createRawChannel } from 'socketcan';
import type { BatteryI } from '../battery/battery';

type RawChannel = ReturnType<typeof createRawChannel>;

enum CanMsgType {
   Alarms = 0x359,
   ChargeParams = 0x351,
   SOC = 0x355,
   VoltsAndTemps = 0x356,
   RequestFlags = 0x35C,
   InverterReply = 0x305,
};

type AlarmsParams = {
   // Protection
   dischargeOverCurrent: boolean,
   chargeOverCurrent: boolean,
   cellUnderTemperature: boolean,
   cellOverTemperature: boolean,
   cellUnderVoltage: boolean,
   cellOverVoltage: boolean,

   // Alarms (warnings)
   dischargeHighCurrent: boolean,
   chargeHighCurrent: boolean,
   cellLowTemperature: boolean,
   cellHighTemperature: boolean,
   cellLowVoltage: boolean,
   cellHighVoltage: boolean,
   systemError: boolean,
   internalCommunicationFail: boolean,
}

export function sendAllPackets(channel: RawChannel, chargeData: ChargeInfo, battery: BatteryI) {
   channel.send(message(chargeParamsPacket(chargeDatt)));
   channel.send(message(stateOfChargePacket(battery)));
   channel.send(message(packVoltagePacket(battery)));
   channel.send(message(alarmsPacket(battery)));
}

function chargeParamsPacket(data: ChargeInfo) {
   const out = buf();
   out.writeUInt16LE(volts(data.chargeVoltLimit));
   out.writeUInt16LE(amps(data.chargingEnabled ? data.chargeCurrentLimit : 0));
   out.writeUInt16LE(amps(data.dischargingEnabled ? data.dischargeCurrentLimit : 0));
   out.writeUInt16LE(volts(data.dischargeVoltLimit));
   return {
      id: CanMsgType.ChargeParams,
      data: out.toBuffer(),
   };
}

function stateOfChargePacket(battery: BatteryI) {
   const out = buf();
   out.writeUInt16LE(percent(battery.getStateOfCharge()));
   out.writeUInt16LE(percent(battery.getStateOfHealth()));
   const vRange = battery.getCellVoltageRange();
   out.writeUInt16LE(millivolts(vRange.max));
   out.writeUInt16LE(millivolts(vRange.min));
   return {
      id: CanMsgType.SOC,
      data: out.toBuffer(),
   };
}

function packVoltagePacket(battery: BatteryI) {
   const out = buf();
   out.writeUInt16LE(Math.round(battery.getVoltage() * 100));
   out.writeUInt16LE(amps(battery.getCurrent()));
   const tempRange = battery.getCellVoltageRange();
   out.writeUInt16LE(temp(tempRange.max));
   out.writeUInt16LE(temp(tempRange.min));
   return {
      id: CanMsgType.VoltsAndTemps,
      data: out.toBuffer(),
   };
}

function alarmsPacket(_battery: BBatteyI) {
   const out = buf();
   return [CanMsgType.Alarms, out];
}

function volts(v: number) {
   return Math.round(10 * v);
}

function millivolts(v: number) {
   return Math.round(1000 * v);
}

function amps(v: number) {
   return Math.round(10 * v);
}

function percent(portion: number) {
   return Math.round(100 * portion);
}

function temp(t: number) {
   return Math.round(t * 10);
}

function buf() {
   return SmartBuffer.fromSize(8);
}
