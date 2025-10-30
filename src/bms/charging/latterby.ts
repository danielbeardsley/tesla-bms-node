import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargingModule, ChargeParameters } from "./charging-module";
import { ProtectedBool, StickyBool } from "../../utils";
import { inverterLogger } from '../../logger';

/**
 * The name means nothing
 *
 * Charge based on the shunt's state of charge, occasionally fully charging
 * to the so the shunt has a reference point.
 **/
export class Latterby implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private socChargeAllowed: ProtectedBool = new ProtectedBool(true);
   private socDischargeAllowed: ProtectedBool = new ProtectedBool(true);
   private timeChargeAllowed: StickyBool;
   private timeDischargeAllowed: StickyBool;

   constructor(config: Config, battery: BatteryI) {
      this.battery = battery;
      this.config = config;
      const rechargeDelaySec = this.myConfig().rechargeDelaySec;
      // minTrueDurationS = 0 to allow immediate disabling when needed
      // It's the disabling that we should make sticky.
      this.timeChargeAllowed = new StickyBool(true, 0, rechargeDelaySec);
      this.timeDischargeAllowed = new StickyBool(true, 0, rechargeDelaySec);
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

      this.socChargeAllowed.update(!isFull, socPct <= config.resumeChargeAtPct);
      this.socDischargeAllowed.update(!isEmpty, socPct >= config.resumeDischargeAtPct);

      this.timeChargeAllowed.set(this.socChargeAllowed.get());
      this.timeDischargeAllowed.set(this.socDischargeAllowed.get());
      const chargingEnabled = this.socChargeAllowed.get() && this.timeChargeAllowed.get();
      const dischargingEnabled = this.socDischargeAllowed.get() && this.timeDischargeAllowed.get();

      inverterLogger.info("Latterby: SOC:%d% timeCharge:%s socCharge:%s => charge:%s | timeDischarge:%s socDischarge:%s => discharge:%s",
         socPct.toFixed(1),
         this.timeChargeAllowed.get(), this.socChargeAllowed.get(), chargingEnabled,
         this.timeDischargeAllowed.get(), this.socDischargeAllowed.get(), dischargingEnabled
      );

      return {
         chargeCurrentLimit: chargingEnabled ? this.config.battery.charging.maxAmps : 0,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled,
         dischargingEnabled,
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
