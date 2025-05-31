import { BatteryI } from "../../battery/battery";
import { Config } from "../../config";
import { inverterLogger } from "../../logger";
import { ramp } from "../../utils";
import { ChargingModule, ChargeParameters } from "./charging-module";

export class VoltageA implements ChargingModule {
   private battery: BatteryI;
   private config: Config;
   private chargeCurrentSmoothed: number|null = 0;
   private cellVoltMaxSmoothed: number|null = null;
   private cellVoltMinSmoothed: number|null = null;
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
      const cellVoltageRange = this.battery.getCellVoltageRange();
      this.cellVoltMinSmoothed = this.smooth(this.cellVoltMinSmoothed, cellVoltageRange.min);
      this.cellVoltMaxSmoothed = this.smooth(this.cellVoltMaxSmoothed, cellVoltageRange.max);

      inverterLogger.debug("Voltage range: %d - %d", cellVoltageRange.min, cellVoltageRange.max);
      // Scale down the charging current as the highest volt cell
      // gets within "buffer" volts of the maxCellVolt setting
      const maxCellVolt = this.config.battery.charging.maxCellVolt;
      const buffer = this.myConfig().maxCellVoltBuffer;
      const chargeScale = ramp(cellVoltageRange.max, maxCellVolt, maxCellVolt - buffer);

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

      const chargeEnabled = this.cellVoltMaxSmoothed < this.config.battery.charging.maxCellVolt && !fullyCharged && !recentlyFull;
      this.chargeCurrentSmoothed = chargeEnabled
         ? this.smooth(this.chargeCurrentSmoothed, this.config.battery.charging.maxAmps * chargeScale)
         : 0;

      return {
         chargeCurrentLimit: this.chargeCurrentSmoothed,
         dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
         chargingEnabled: chargeEnabled,
         dischargingEnabled: this.cellVoltMinSmoothed > this.config.battery.discharging.minCellVolt,
      };
   }

   private smooth(prev: number|null, newVal: number): number {
      return prev === null ? newVal : prev * 0.9 + newVal * 0.1;
   }
}
