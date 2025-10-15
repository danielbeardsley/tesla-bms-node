import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargingModule, ChargeParameters } from "./charging-module";

/**
 * The name means nothing
 *
 * Charge based on the shunt's state of charge, occasionally fully charging
 * to the so the shunt has a reference point.
 **/
export class Latterby implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private wasRecentlyEmpty: boolean = false;
   private wasRecentlyFull: boolean = false;

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

      if (isEmpty) {
         this.wasRecentlyEmpty = true;
      }

      if (!isEmpty && socPct >= config.resumeDischargeAtPct) {
         this.wasRecentlyEmpty = false;
      }

      if (isFull) {
         this.wasRecentlyFull = true;
      }

      if (!isFull && socPct <= config.resumeChargeAtPct) {
         this.wasRecentlyFull = false;
      }

      console.log(`Latterby: SOC=${socPct.toFixed(1)}%, V=${this.battery.getVoltage().toFixed(2)}V, isFull=${isFull}, isEmpty=${isEmpty}, wasRecentlyFull=${this.wasRecentlyFull}, wasRecentlyEmpty=${this.wasRecentlyEmpty} resumeChargeAtPct=${config.resumeChargeAtPct} resumeDischargeAtPct=${config.resumeDischargeAtPct}`);
      const chargeEnabled = !isFull && (this.isSynchronizationDay() || !this.wasRecentlyFull);
      const dischargeEnabled = !isEmpty && !this.wasRecentlyEmpty;

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
