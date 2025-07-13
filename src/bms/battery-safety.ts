import { BatteryI } from "../battery/battery";
import { Config } from "../config";
import { inverterLogger } from "../logger";
import { ramp } from "../utils";
import { ChargingModule, ChargeParameters } from "./charging/charging-module";

export class BatterySafety implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private smoothingFactor: number = 0.9; // Smooth out changes in the cell volts and charging amps
   private chargeCurrentSmoothed: number|null = 0;
   private cellVoltMaxSmoothed: number|null = null;
   private cellVoltMinSmoothed: number|null = null;

   constructor(config: Config, battery: BatteryI, smoothingFactor: number = 0.9) {
      this.battery = battery;
      this.config = config;
      this.smoothingFactor = smoothingFactor;
   }

   getChargeDischargeInfo(): ChargeParameters {
      const cellVoltageRange = this.battery.getCellVoltageRange();
      this.cellVoltMinSmoothed = this.smooth(this.cellVoltMinSmoothed, cellVoltageRange.min);
      this.cellVoltMaxSmoothed = this.smooth(this.cellVoltMaxSmoothed, cellVoltageRange.max);

      inverterLogger.debug("Saftety: Voltage range: %d - %d", cellVoltageRange.min, cellVoltageRange.max);
      // Scale down the charging current as the highest volt cell
      // gets within "buffer" volts of the maxCellVolt setting
      const maxCellVolt = this.config.battery.safety.maxCellVolt;
      const buffer = this.config.battery.safety.maxCellVoltBuffer;
      const chargeScale = ramp(cellVoltageRange.max, maxCellVolt, maxCellVolt - buffer);

      const chargingEnabled = this.cellVoltMaxSmoothed < maxCellVolt;
      const dischargingEnabled = this.cellVoltMinSmoothed > this.config.battery.safety.minCellVolt;
      this.chargeCurrentSmoothed = chargingEnabled
         ? this.smooth(this.chargeCurrentSmoothed, this.config.battery.charging.maxAmps * chargeScale)
         : 0;

      return {
         chargeCurrentLimit: Math.round(this.chargeCurrentSmoothed),
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled,
         dischargingEnabled,
      };
   }

   private smooth(prev: number|null, newVal: number): number {
      return prev === null ? newVal : prev * this.smoothingFactor + newVal * (1 - this.smoothingFactor);
   }
}
