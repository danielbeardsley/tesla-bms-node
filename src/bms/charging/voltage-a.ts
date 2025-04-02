import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { ChargeInfo } from "../../inverter/commands/get-charge-discharge-info";
import { inverterLogger } from "../../logger";
import { clamp } from "../..//utils";
import { ChargingModule } from "./charging-module";

export class VoltageA implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private chargeCurrentSmoothed: number|null = null;
   private cellVoltMaxSmoothed: number|null = null;
   private cellVoltMinSmoothed: number|null = null;

   constructor(config: Config, battery: BatteryI) {
      this.battery = battery;
      this.config = config;
   }

   myConfig() {
      return this.config.bms.chargingStrategy.voltageA; // || throw new Error("VoltageA config not found");
   }

   getChargeDischargeInfo(): ChargeInfo {
      const cellVoltageRange = this.battery.getCellVoltageRange();
      this.cellVoltMinSmoothed = this.smooth(this.cellVoltMinSmoothed, cellVoltageRange.min);
      this.cellVoltMaxSmoothed = this.smooth(this.cellVoltMaxSmoothed, cellVoltageRange.max);

      inverterLogger.debug("Voltage range: %d - %d", cellVoltageRange.min, cellVoltageRange.max);
      // Scale down the charging current as the highest volt cell
      // gets within "buffer" volts of the maxCellVolt setting
      const maxCellVolt = this.config.battery.charging.maxCellVolt;
      const buffer = 0.2;
      const bufferStart = maxCellVolt - buffer;
      const chargeScale = 1 - clamp((cellVoltageRange.max - bufferStart) / buffer, 0, 1);

      // Scale down the charging current as the highest volt cell
      // gets within "buffer" volts of the maxCellVolt setting
      const minCellVolt = this.config.battery.discharging.minCellVolt;
      const bufferMinStart = minCellVolt + buffer;
      const dischargeScale = 1 - clamp((bufferMinStart - cellVoltageRange.min) / buffer, 0, 1);

      this.chargeCurrentSmoothed = this.smooth(this.chargeCurrentSmoothed, this.config.battery.charging.maxAmps * chargeScale);

      return {
         chargeVoltLimit: this.config.battery.charging.maxVolts,
         dischargeVoltLimit: this.config.battery.discharging.minVolts,
         chargeCurrentLimit: this.chargeCurrentSmoothed,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps * dischargeScale,
         chargingEnabled: this.cellVoltMaxSmoothed < this.config.battery.charging.maxCellVolt,
         dischargingEnabled: this.cellVoltMinSmoothed > this.config.battery.discharging.minCellVolt,
      };
   }

   private smooth(prev: number|null, newVal: number): number {
      return prev === null ? newVal : prev * 0.9 + newVal * 0.1;
   }
}
