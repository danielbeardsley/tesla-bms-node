import { generatePacket } from '../pylontech-packet';
import { ReturnCode } from '../pylontech-command';
import { SmartBuffer } from 'smart-buffer';
import { inverterLogger as logger } from '../../logger';

export type ChargeInfo = {
   chargeVoltLimit: number;
   dischargeVoltLimit: number;
   chargeCurrentLimit: number;
   dischargeCurrentLimit: number;
   chargingEnabled: boolean;
   dischargingEnabled: boolean;
   chargeFromGrid: boolean;
   _meta?: {
      [key: string]: boolean | number | object;
   };
}

export default {
   Response: {
      generate: (address: number, data: ChargeInfo): Buffer => {
         logger.verbose("Composing charge info packet %j", data);
         const out = new SmartBuffer();
         out.writeUInt8(address); // "Command value"
         out.writeUInt16BE(voltsToPylonVolts(data.chargeVoltLimit));
         out.writeUInt16BE(voltsToPylonVolts(data.dischargeVoltLimit));
         out.writeInt16BE(ampsToPylonAmps(data.chargingEnabled ? data.chargeCurrentLimit : 0));
         out.writeInt16BE(ampsToPylonAmps(data.dischargingEnabled ? -data.dischargeCurrentLimit : 0));
         out.writeUInt8(
            bit(7, data.chargingEnabled) |
            bit(6, data.dischargingEnabled) |
            bit(3, data.chargeFromGrid)
         );
         logger.silly("Generated charge info packet: %s", out.toBuffer().toString('hex'));
         return generatePacket(address, ReturnCode.Normal, out.toBuffer());
      }
   }
}

function bit(pos: number, value: boolean): number {
   return value ? 1 << pos : 0;
}

function voltsToPylonVolts(v: number): number {
   return Math.round(v * 1000);
}

function ampsToPylonAmps(a: number): number {
   return Math.round(a * 10);
}
