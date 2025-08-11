import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from "../logger";
import { SerialPort } from 'serialport';
import type { BatteryI } from '../battery/battery';
import type { ChargeInfo } from './commands/get-charge-discharge-info';

const CAN_MSG_SIZE = 8; // CAN messages are 8 bytes long

export enum CanMsgType {
   NetworkAlive = 0x305,
   Alarms = 0x359,
   ChargeParams = 0x351,
   SOC = 0x355,
   VoltsAndTemps = 0x356,
   RequestFlags = 0x35C,
   BatteryName = 0x35E,

   CellVoltsAndTemps = 0x70,
};

// https://github.com/tixiv/lib-slcan/blob/master/slcan.c

/*
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
*/

export function sendAllPackets(port: SerialPort, chargeData: ChargeInfo, battery: BatteryI) {
   port.write(frame(networkAlivePacket()));
   port.write(frame(chargeParamsPacket(chargeData)));
   port.write(frame(stateOfChargePacket(battery)));
   port.write(frame(packVoltagePacket(battery)));
   port.write(frame(alarmsPacket(battery)));
   port.write(frame(batteryNamePacket()));
   port.write(frame(requestFlagsPacket(chargeData)));
   port.write(frame(cellVoltsAndTemps(battery)));
   port.write("E\r"); // Request error state
}

function frame(packet: { id: CanMsgType, data: Buffer }) {
   const frame = new SmartBuffer();
   // t = transmit frame with 3-byte ID
   frame.writeString('t');
   // can ID
   frame.writeString(toHex(packet.id, 3));
   frame.writeString(canDataLength(packet.data));
   frame.writeString(bufferToHex(packet.data));
   frame.writeString("\r");
   const bytes = frame.toBuffer();
   logger.silly("Writing to canbus usb: %s", bytes.toString());
   return bytes;
}

function networkAlivePacket() {
   return {
      id: CanMsgType.NetworkAlive,
      data: Buffer.alloc(CAN_MSG_SIZE),
   };
}

function requestFlagsPacket(data: ChargeInfo) {
   const out = buf();
   const flags =
      bit(data.dischargingEnabled, 6) |
      bit(data.chargingEnabled, 7);

   out.writeUInt8(flags);
   out.writeUInt8(0); // reserved
   return {
      id: CanMsgType.RequestFlags,
      data: out.toBuffer(),
   };
}

function chargeParamsPacket(data: ChargeInfo) {
   const out = buf();
   logger.verbose("Composing charge params packet %j", data);
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
   out.writeUInt16LE(percent(battery.getStateOfCharge() * 10));
   return {
      id: CanMsgType.SOC,
      data: out.toBuffer(),
   };
}

function packVoltagePacket(battery: BatteryI) {
   const out = buf();
   out.writeInt16LE(Math.round(battery.getVoltage() * 100));
   out.writeInt16LE(amps(battery.getCurrent() || 0));
   const tempRange = battery.getTemperatureRange();
   out.writeInt16LE(temp(tempRange.max));
   return {
      id: CanMsgType.VoltsAndTemps,
      data: out.toBuffer(),
   };
}

function cellVoltsAndTemps(battery: BatteryI) {
   const out = buf();
   const voltRange = battery.getCellVoltageRange();
   out.writeInt16LE(Math.round(voltRange.max * 100));
   out.writeInt16LE(Math.round(voltRange.min * 100));
   const tempRange = battery.getTemperatureRange();
   out.writeInt16LE(temp(tempRange.max));
   out.writeInt16LE(temp(tempRange.min));
   return {
      id: CanMsgType.CellVoltsAndTemps,
      data: out.toBuffer(),
   };
}

function batteryNamePacket() {
   const out = buf();
   out.writeInt16LE(1234);
   out.writeInt16LE(4321);
   out.writeInt16LE(1122);
   out.writeInt16LE(2233);
   return {
      id: CanMsgType.BatteryName,
      data: out.toBuffer()
   };
}

function alarmsPacket(_battery: BatteryI) {
   const out = buf();
   out.writeUInt32LE(0); // No alarms for now
   out.writeUInt8(1); // count of battery modules
   // extra 0s to fill us up to 8 bytes
   out.writeUInt8(0);
   out.writeUInt8(0);
   out.writeUInt8(0);
   return {
      id: CanMsgType.Alarms,
      data: out.toBuffer(),
   };
}

function volts(v: number) {
   return Math.round(10 * v);
}

function amps(a: number) {
   return Math.round(10 * a);
}

function percent(portion: number) {
   return Math.round(100 * portion);
}

function temp(t: number) {
   return Math.round(t * 10);
}

function buf() {
   return SmartBuffer.fromSize(CAN_MSG_SIZE);
}

function bit(val: boolean, offset: number) {
   return val ? (1 << offset) : 0;
}

export function toHex(num: number, length: number): string {
   if (num >= Math.pow(16, length)) {
      throw new Error(`Number (${num}) too large to be represented by ${length} hex chars`);
   }
   return num.toString(16).toUpperCase().padStart(length, '0');
}

export function bufferToHex(buffer: Buffer): string {
   return buffer.toString('hex').toUpperCase();
}

function canDataLength(buffer: Buffer): string {
   if (buffer.length > 8) {
      const bufAsHex = bufferToHex(buffer);
      throw new Error(`Can data must be 8 bytes or less, "${bufAsHex}" is ${buffer.length} bytes`);
   }
   return String(buffer.length);
}
