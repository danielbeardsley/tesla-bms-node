import { BatteryI } from "src/battery/battery";
import { Config } from "src/config";
import { ChargeInfo } from "src/inverter/commands/get-charge-discharge-info";
import { inverterLogger } from "src/logger";
import { clamp } from "src/utils";
import { ChargingModule } from "./charging-module";

export class VoltageA implements ChargingModule {
    private battery: BatteryI;
    private config: Config;

   constructor(config: Config, battery: BatteryI) {
      this.battery = battery;
      this.config = config;
   }

   myConfig() {
      return this.config.bms.chargingStrategy.voltageA; // || throw new Error("VoltageA config not found");
   }

   getChargeDischargeInfo(): ChargeInfo {
      const cellVoltageRange = this.battery.getCellVoltageRange();
      inverterLogger.debug("Voltage range: %d - %d", cellVoltageRange.min, cellVoltageRange.max);
      // Scale down the charging current as the highest volt cell
      // gets within "buffer" volts of the maxCellVolt setting
      const maxCellVolt = this.config.battery.charging.maxCellVolt;
      const buffer = 0.2;
      const bufferStart = maxCellVolt - buffer;
      const chargeScale = 1 - clamp((cellVoltageRange.max - bufferStart) / buffer, 0, 1);

      return {
         chargeVoltLimit: this.config.battery.charging.maxVolts,
         dischargeVoltLimit: this.config.battery.discharging.minVolts,
         chargeCurrentLimit: this.config.battery.charging.maxAmps * chargeScale,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled: cellVoltageRange.max < this.config.battery.charging.maxCellVolt,
         dischargingEnabled: cellVoltageRange.min > this.config.battery.discharging.minCellVolt,
      };
   }
}