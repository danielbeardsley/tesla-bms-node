import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargingModule, ChargeParameters } from "./charging-module";

export class VoltageA implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private fullTime: number|null = null;

   constructor(config: Config, battery: BatteryI) {
      this.battery = battery;
      this.config = config;
   }

   myConfig() {
      const conf = this.config.bms.chargingStrategy.voltageA;
      if (!conf) {
         throw new Error("VoltageA config not found");
      }
      return conf;
   }

   getChargeDischargeInfo(): ChargeParameters {
      const fullyCharged = this.battery.getStateOfCharge() >= 1;

      if (!this.fullTime && fullyCharged) {
         this.fullTime = Date.now();
      }

      const recentlyFull = this.fullTime &&
         ((Date.now() - this.fullTime) < 20 * 60 * 1000
          || fullyCharged);

      if (this.fullTime && !recentlyFull) {
         this.fullTime = null;
      }

      const chargeEnabled = !fullyCharged && !recentlyFull;

      return {
         chargeCurrentLimit: chargeEnabled ? this.config.battery.charging.maxAmps : 0,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled: chargeEnabled,
         dischargingEnabled: true,
      };
   }
}
