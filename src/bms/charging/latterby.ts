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
   private lastFullTime: number = 0;

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
      const socPct = this.battery.getStateOfCharge() * 100;

      const isFull = this.isSynchronizationDay() ?
         this.battery.getVoltage() >= config.synchronizationVoltage :
         socPct >= config.stopChargeAtPct;

      const recentlyFull = (Date.now() - this.lastFullTime) < (config.rechargeDelaySec * 1000);

      // If we're full, start the clock
      if (isFull) {
         this.lastFullTime = Date.now();
      }

      const chargeEnabled = !isFull && !recentlyFull;

      return {
         chargeCurrentLimit: chargeEnabled ? this.config.battery.charging.maxAmps : 0,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled: chargeEnabled,
         dischargingEnabled: socPct > config.stopDischargeAtPct,
      };
   }

   isSynchronizationDay(): boolean {
      const days = this.myConfig().synchronizationDaysOfMonth;
      const today = new Date();
      return days.includes(today.getDate());
   }
}
