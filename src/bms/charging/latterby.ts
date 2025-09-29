import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargingModule, ChargeParameters } from "./charging-module";
import { stickyBool, type StickyBool } from "../../utils";

/**
 * The name means nothing
 *
 * Charge based on the shunt's state of charge, occasionally fully charging
 * to the so the shunt has a reference point.
 **/
export class Latterby implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private isFull: StickyBool;

   constructor(config: Config, battery: BatteryI) {
      this.battery = battery;
      this.config = config;
      this.isFull = stickyBool(
         false,
         // Delay transitioing from full to not full for this long
         // to prevent rapid flip-flopping of the charging state.
         this.myConfig().rechargeDelaySec,
         // We can transition from not full to full immediately
         0);
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

      this.isFull.set(isFull);

      const chargeEnabled = !this.isFull.get();

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

   getStateOfCharge(): number {
      const soc = this.battery.getStateOfCharge();
      return this.isSynchronizationDay() ?
         // On a sync day, never report full and hover at 0.99.
         // This lets us charge till we hit the max cell volts
         Math.min(0.99, soc) :
         soc;
   }
}
