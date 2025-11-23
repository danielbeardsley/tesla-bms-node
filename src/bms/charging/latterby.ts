import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargingModule, ChargeParameters } from "./charging-module";
import { ProtectedBool, StickyBool } from "../../utils";
import { inverterLogger } from '../../logger';
import { StorageInterface } from "../../storage";

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
   private storage: StorageInterface;

   constructor(config: Config, battery: BatteryI, storage: StorageInterface) {
      this.storage = storage;
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

      const isFull = socPct >= config.stopChargeAtPct;
      const isEmpty = socPct <= config.stopDischargeAtPct;

      this.socChargeAllowed.update(!isFull, socPct <= config.resumeChargeAtPct);
      this.socDischargeAllowed.update(!isEmpty, socPct >= config.resumeDischargeAtPct);

      this.timeChargeAllowed.set(this.socChargeAllowed.get());
      this.timeDischargeAllowed.set(this.socDischargeAllowed.get());
      const chargingEnabled = this.needsFullCharge() || (this.socChargeAllowed.get() && this.timeChargeAllowed.get());
      const dischargingEnabled = this.socDischargeAllowed.get() && this.timeDischargeAllowed.get() && this.dischargeAllowedByTime();

      inverterLogger.info(
         "Latterby: SOC:%d% needsFullCharge:%s timeCharge:%s socCharge:%s => charge:%s | timeDelayDischarge:%s socDischarge:%s timeOfDayDischarge:%s => discharge:%s",
         socPct.toFixed(1),
         this.needsFullCharge(), this.timeChargeAllowed.get(), this.socChargeAllowed.get(), chargingEnabled,
         this.timeDischargeAllowed.get(), this.socDischargeAllowed.get(), this.dischargeAllowedByTime(), dischargingEnabled,
      );

      this.detectFullCharge();

      return {
         chargeCurrentLimit: chargingEnabled ? this.config.battery.charging.maxAmps : 0,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled,
         dischargingEnabled,
         chargeFromGrid: this.needsGridCharge(),
      };
   }

   needsFullCharge(): boolean {
      const sinceLastFullCharge = Date.now() - (this.storage.get().lastFullCharge || 0);
      return sinceLastFullCharge >= this.myConfig().daysBetweenSynchronizations * 24 * 60 * 60 * 1000;
   }

   needsGridCharge(): boolean {
      const sinceLastFullCharge = Date.now() - (this.storage.get().lastFullCharge || 0);
      const config = this.myConfig();
      const gridDelayDays = config.chargeFromGridDelayDays;
      if (gridDelayDays === undefined) {
         return false;
      }
      const daysBeforeGridCharge = gridDelayDays + config.daysBetweenSynchronizations;
      return sinceLastFullCharge >= daysBeforeGridCharge * 24 * 60 * 60 * 1000;
   }

   dischargeAllowedByTime(): boolean {
      const range = this.myConfig().disableDischargeTimeRange;
      if (!range) {
         return true;
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      const t = new Date();
      const current = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
      return current < range.from || current > range.to;
   }

   getStateOfCharge(): number {
      const soc = this.battery.getStateOfCharge();
      return this.needsFullCharge() ?
         // On a sync day, never report full and hover at 0.99.
         // This lets us charge till we hit the max cell volts
         Math.min(0.99, soc) :
         soc;
   }

   detectFullCharge() {
      const isFullyCharged =
         this.battery.getStateOfCharge() >= 1 &&
         this.battery.getVoltage() >= this.myConfig().synchronizationVoltage;

      if (isFullyCharged) {
         inverterLogger.info("Latterby: Battery 100% charged at %dV, updating lastFullCharge timestamp", this.battery.getVoltage());
         this.storage.update({lastFullCharge: Date.now()});
      }
   }
}
