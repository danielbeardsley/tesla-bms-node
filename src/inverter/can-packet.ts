import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from "../logger";

export enum CanMsgType {
   Alarms = 0x359,
   ChargeParams = 0x351,
   SOC = 0x355,
   VoltsAndTemps = 0x356,
   RequestFlags = 0x35C,
   InverterReply = 0x305,
};

export type AlarmsParams = {
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

export function chargeParamsPacket(data: ChargeInfo) {
   const out = new SmartBuffer();
   out.writeUInt16LE(volts(data.chargeVoltLimit));
   out.writeInt16LE(amps(data.chargingEnabled ? data.chargeCurrentLimit : 0));
   out.writeInt16EE(amps(data.dischargingEnabled ? data.dischargeCurrentLimit : 0));
   out.writeUInt16LE(volts(data.dischargeVoltLimit));
   return [CanMsgType.ChargeParams, out];
}

export function alarmsPacket() {
   const out = new SmartBuffer();
   return [CanMsgType.Alarms, out];
}

function volts(v: number) {
   return 10 * v;
}

function amps(v: number) {
   return 10 * v;
}
