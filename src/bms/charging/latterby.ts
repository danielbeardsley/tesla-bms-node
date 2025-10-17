import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargingModule, ChargeParameters } from "./charging-module";
import { ProtectedBool } from "../../utils";

/**
 * The name means nothing
 *
 * Charge based on the shunt's state of charge, occasionally fully charging
 * to the so the shunt has a reference point.
 **/
export class Latterby implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private chargeAllowed: ProtectedBool = new ProtectedBool(true);
   private dischargeAllowed: ProtectedBool = new ProtectedBool(true);

   constructor(config: Config, battery: BatteryI) {
      this.battery = battery;
      this.config = config;
   }

   myConfig() {
      const conf = this.config.bms.chargingStrategy.latterby;
      if (!conf) {
         throw new Error("Latterby config not found");
      }
      return conf;
   }

   getChargeDischargeInfo(): ChargeParameters {
      const config = this.myConfig();
      const socPct = this.getStateOfCharge() * 100;

      const isFull = this.isSynchronizationDay() ?
         this.battery.getVoltage() >= config.synchronizationVoltage :
         socPct >= config.stopChargeAtPct;
      const isEmpty = socPct <= config.stopDischargeAtPct;

      this.chargeAllowed.update(!isFull, socPct <= config.resumeChargeAtPct);
      this.dischargeAllowed.update(!isEmpty, socPct >= config.resumeDischargeAtPct);

      const chargeEnabled = this.chargeAllowed.get();
      const dischargeEnabled = this.dischargeAllowed.get();

      return {
         chargeCurrentLimit: chargeEnabled ? this.config.battery.charging.maxAmps : 0,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled: chargeEnabled,
         dischargingEnabled: dischargeEnabled,
      };
   }

   isSynchronizationDay(): boolean {
      const days = this.myConfig().synchronizationDaysOfMonth;
      const today = new Date();
      return days.includes(today.getDate());
   }

   getStateOfCharge(): number {
      const soc = this.battery.getStateOfCharge();
      return this.isSynchronizationDay() ?
         // On a sync day, never report full and hover at 0.99.
         // This lets us charge till we hit the max cell volts
         Math.min(0.99, soc) :
         soc;
   }
}
