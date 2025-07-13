import AsyncLock from 'async-lock';
import { BatteryModuleI } from './tesla-module';
import { clamp } from '../utils';
import type { Config } from '../config';
import { logger } from '../logger';
import { Shunt } from './shunt';
import { Downtime } from '../history/downtime';

export interface BatteryI {
   modules: { [key: number]: BatteryModuleI };
   readAll(): Promise<void>;
   balance(forSeconds: number): Promise<number>;
   stopBalancing(): Promise<void>;
   getVoltage() : number;
   getCurrent() : number | undefined;
   getCapacityAh(): number;
   getStateOfCharge(): number;
   getStateOfHealth(): number;
   getCellVoltageRange(): { min: number, max: number, spread: number };
   getTemperatureRange(): { min: number, max: number, spread: number };
   getLastUpdateDate(): number;
   isTemperatureSafe(): boolean;
   readonly downtime: Downtime;
}

export class Battery implements BatteryI {
   public modules: { [key: number]: BatteryModuleI };
   private shunt: Shunt;
   private config: Config;
   private lock: AsyncLock;
   public readonly downtime: Downtime;

   constructor(modules: BatteryModuleI[], shunt: Shunt, config: Config) {
      this.modules = modules;
      this.shunt = shunt;
      this.lock = new AsyncLock();
      this.config = config;
      this.downtime = new Downtime(this.config.bms.intervalS * 1_000 * 1.3);
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

   getCurrent() {
      return this.shunt.getCurrent();
   }

   getCapacityAh() {
      return this.config.battery.capacityPerModuleAh * this.config.battery.moduleCount / 2
   }

   getStateOfCharge() {
      const bat = this.config.battery;
      const voltageBasedChargeLevel =
       (this.getVoltage() - bat.voltsEmpty) /
       (bat.voltsFull - bat.voltsEmpty);
      const shuntSOC = this.shunt.getSOC();
      const soc = clamp(voltageBasedChargeLevel, 0, 1);
      logger.info("SOC - Voltage: %s%", (100 * soc).toFixed(2));
      logger.info("SOC - Shunt:   %s%", (100 * (shuntSOC || 0)).toFixed(2));
      return soc;
   }

   getStateOfHealth() {
      return 1;
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
      return tempRange.min >= this.config.battery.safety.lowTempCutoffC &&
             tempRange.max <= this.config.battery.safety.highTempCutoffC;
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
      let cellsAbove = 0;
      for (const series of this.config.battery.modulesInSeries) {
         const modulesInSeries = series.map((index) => this.modules[index]);
         const min = Math.min(...modulesInSeries.map((m) => m.getMinVoltage()));
         const maxDiff = this.config.battery.balance.cellVDiffMax;
         const balanceAboveV = Math.max(min + maxDiff, this.config.battery.balance.onlyAbove);
         logger.verbose("Balancing all cells above %sV (min:%sV + %sV) for %d sec", balanceAboveV.toFixed(3), min.toFixed(3), maxDiff.toFixed(3), forSeconds);
         for (const module of modulesInSeries) {
            await this.lock.acquire('key', async () => {
               cellsAbove += await module.balanceCellsAbove(balanceAboveV, forSeconds);
            });
         }
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
      const beforeUpdate = Date.now();
      logger.info("Reading all battery modules");
      for (const key in this.modules) {
         const module = this.modules[key];
         await this.lock.acquire('key', () =>
            module
               .readStatus() // this reads faults and alerts
               .then(() => module.readValues())
         ); // this reads temperatures and voltages
      }
      const lastUpdate = this.getLastUpdateDate();
      if (lastUpdate > beforeUpdate) {
         this.downtime.up();
      } else {
         logger.warn("Not all modules updated, %ds since last update", Math.round((beforeUpdate - lastUpdate) / 1000));
      }
   }
}
