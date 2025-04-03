import AsyncLock from 'async-lock';
import { BatteryModuleI } from './tesla-module';
import { clamp } from '../utils';
import type { Config } from '../config';
import { logger } from '../logger';

export interface BatteryI {
   modules: { [key: number]: BatteryModuleI };
   readAll(): Promise<void>;
   balance(forSeconds: number): Promise<number>;
   stopBalancing(): Promise<void>;
   getVoltage() : number;
   getCapacityAh(): number;
   getStateOfCharge(): number;
   getCellVoltageRange(): { min: number, max: number, spread: number };
   getTemperatureRange(): { min: number, max: number, spread: number };
   getLastUpdateDate(): number;
   isTemperatureSafe(): boolean;
}

export class Battery implements BatteryI {
   public modules: { [key: number]: BatteryModuleI };
   private config: Config;
   private lock: AsyncLock;

   constructor(modules: BatteryModuleI[], config: Config) {
      this.modules = modules;
      this.lock = new AsyncLock();
      this.config = config;
   }

   async sleep() {
      logger.info("Sleeping all modules");
      // puts all boards to slee
      return Object.values(this.modules).forEach(async module => await module.sleep());
   }

   /**
    * Calculates the whole battery voltage from the voltage of each module
    */
   getVoltage() {
      const moduleVolts = Object.values(this.modules).map(module => module.getCellVoltageSum());
      const sum = moduleVolts.reduce((acc, v) => acc + v, 0);
      return sum / (moduleVolts.length / 2);
   }

   getCapacityAh() {
      return this.config.battery.capacityPerModuleAh * this.config.battery.moduleCount / 2
   }

   getStateOfCharge() {
      const bat = this.config.battery;
      const voltageBasedChargeLevel =
       (this.getVoltage() - bat.voltsEmpty) /
       (bat.voltsFull - bat.voltsEmpty);
       return clamp(voltageBasedChargeLevel, 0, 1);
   }

   getCellVoltageRange() {
      const modules = Object.values(this.modules);
      const min = Math.min(...modules.map((m) => m.getMinVoltage()));
      const max = Math.max(...modules.map((m) => m.getMaxVoltage()));
      return {
         min,
         max,
         spread: max - min,
      };
   }

   getTemperatureRange() {
      const modules = Object.values(this.modules);
      const temps = modules.flatMap((m) => m.temperatures);
      const min = Math.min(...temps);
      const max = Math.max(...temps);
      return {
         min,
         max,
         spread: max - min,
      };
   }

   isTemperatureSafe() {
      const tempRange = this.getTemperatureRange();
      return tempRange.min >= this.config.battery.lowTempCutoffC && tempRange.max <= this.config.battery.highTempCutoffC;
   }

   /**
    * Returns the unix timestamp of the oldest last update of all the modules.
    * Effectively the date of the oldest data we have.
    */
   getLastUpdateDate() {
      return Math.min(...Object.values(this.modules).map((m) => m.lastUpdate));
   }

   /**
    * Note: Caller should stop balancing and read all values first
    */
   async balance(forSeconds: number): Promise<number> {
      const {min} = this.getCellVoltageRange();
      const maxDiff = this.config.battery.balance.cellVDiffMax;
      const balanceAboveV = min + maxDiff;
      logger.verbose("Balancing all cells above %sV (min:%sV + %sV) for %d sec", balanceAboveV.toFixed(3), min.toFixed(3), maxDiff.toFixed(3), forSeconds);
      let cellsAbove = 0;
      for (const index in this.modules) {
         await this.lock.acquire('key', async () => {
            cellsAbove += await this.modules[index].balanceCellsAbove(balanceAboveV, forSeconds);
         });
      }
      if (cellsAbove > 0) {
         logger.info("Balancing initiated on %d cells", cellsAbove);
      } else {
         logger.debug("Balancing skipped, no cells to balance");
      }
      return cellsAbove;
   }

   async stopBalancing() {
      const falses = [false, false, false, false, false, false];

      for (const index in this.modules) {
         await this.lock.acquire('key', () => this.modules[index].balance(falses));
      }
   }

   async readAll() {
      for (const key in this.modules) {
         const module = this.modules[key];
         await this.lock.acquire('key', () =>
            module
               .readStatus() // this reads faults and alerts
               .then(() => module.readValues())
         ); // this reads temperatures and voltages
      }
   }
}
