import { BatteryI } from "../battery/battery";
import { Config } from "../config";
import { inverterLogger } from "../logger";
import { ramp } from "../utils";
import { ChargingModule, ChargeParameters } from "./charging/charging-module";

export class BatterySafety implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   // Smooth out changes in inputs including this portion
   // of the previous value every second
   private smoothingFactor: number;
   private chargeCurrentSmoothed: number|null = 0;
   private cellVoltMaxSmoothed: number|null = null;
   private cellVoltMinSmoothed: number|null = null;
   private lastCall: number;
   private dischargeReenableSoc: number|null = null;

   constructor(config: Config, battery: BatteryI, smoothingFactor: number) {
      this.battery = battery;
      this.config = config;
      this.smoothingFactor = smoothingFactor;
      this.lastCall = Date.now();
   }

   getChargeDischargeInfo(): ChargeParameters {
      const safety = this.config.battery.safety;
      const cellVoltageRange = this.battery.getCellVoltageRange();
      this.cellVoltMinSmoothed = this.smooth(this.cellVoltMinSmoothed, cellVoltageRange.min);
      this.cellVoltMaxSmoothed = this.smooth(this.cellVoltMaxSmoothed, cellVoltageRange.max);

      inverterLogger.debug("Saftety: Voltage range: %d - %d", cellVoltageRange.min, cellVoltageRange.max);
      // Scale down the charging current as the highest volt cell
      // gets within "buffer" volts of the maxCellVolt setting
      const maxCellVolt = safety.maxCellVolt;
      const buffer = safety.maxCellVoltBuffer;
      const chargeScale = ramp(cellVoltageRange.max, maxCellVolt, maxCellVolt - buffer);

      const chargingEnabled = this.cellVoltMaxSmoothed < maxCellVolt;
      const dischargingEnabled = this.cellVoltMinSmoothed > safety.minCellVolt;
      this.chargeCurrentSmoothed = chargingEnabled
         ? this.smooth(this.chargeCurrentSmoothed, this.config.battery.charging.maxAmps * chargeScale)
         : 0;

      this.lastCall = Date.now();

      return {
         chargeCurrentLimit: Math.round(this.chargeCurrentSmoothed),
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled,
         dischargingEnabled : this.allowDischarge(dischargingEnabled),
      };
   }

   private smooth(prev: number|null, newVal: number): number {
      // We don't know the timing of calling this function, so we interpolate
      // the smoothing factor based on the time since the last call.
      const interpolatedFactor = Math.pow(this.smoothingFactor, this.secondsSinceLastCall());
      return prev === null ? newVal : prev * interpolatedFactor + newVal * (1 - interpolatedFactor);
   }

   // Prevent rapid on/off cycling of discharging when we disable discharging
   // because of low-voltage. We do this by requiring the SOC to rise
   private allowDischarge(dischargingEnabled: boolean): boolean {
      const soc = this.getStateOfCharge();

      if (this.dischargeReenableSoc === null) {
         if (!dischargingEnabled) {
            this.dischargeReenableSoc = soc + (this.config.battery.safety.cellVoltLimitSocRecovery / 100);
         }
      } else if (soc > this.dischargeReenableSoc) {
         this.dischargeReenableSoc = null;
      }

      return this.dischargeReenableSoc === null && dischargingEnabled;
   }

   secondsSinceLastCall(): number {
      return (Date.now() - this.lastCall) / 1000;
   }

   getStateOfCharge(): number {
      return this.battery.getStateOfCharge();
   }
}
