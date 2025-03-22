import AsyncLock from 'async-lock';
import { TeslaModule, BQAlerts, BQFaults, Registers, BatteryModuleI } from './tesla-module';
import { sleep } from '../utils';
import { TeslaComms, BROADCAST_ADDR } from './tesla-comms';
import type { Config } from '../config';
import { logger } from '../logger';

export interface BatteryI {
   modules: { [key: number]: BatteryModuleI };
   init: (renumber: boolean) => Promise<void>;
}

export class Battery implements BatteryI {
   public modules: { [key: number]: TeslaModule };
   private config: Config;
   private lock: AsyncLock;
   private teslaComms: TeslaComms;

   constructor(teslaComms: TeslaComms, config: Config) {
      this.modules = {};
      this.lock = new AsyncLock();
      this.config = config;
      this.teslaComms = teslaComms;
   }

   async init(renumberOnFailure: boolean = true) {
      const { found, missing } = await this.findModules();
      if (missing.length > 0) {
         const missingIds = missing.join(', ');
         if (renumberOnFailure) {
            logger.error("Unable to communicate with modules: %s - trying to renumber them", missingIds);
            await this.teslaComms.renumberModules(this.config.battery.moduleCount);
            await this.init(false);
            return;
         }
         const msg = `Unable to communicate with modules: ${missingIds} - giving up`;
         logger.error(msg);
         throw new Error(msg);
      }

      for (const moduleNumber of found) {
         this.modules[moduleNumber] = new TeslaModule(this.teslaComms, moduleNumber);
      }
   }

   close() {
      this.teslaComms.close();
   }

   private async findModules() {
      logger.info('Trying to find %d modules', this.config.battery.moduleCount);
      let moduleNumber: number;
      const missing: number[] = [];
      const found: number[] = [];

      for (moduleNumber = 1; moduleNumber <= this.config.battery.moduleCount; moduleNumber++) {
         await this.lock
            .acquire('key', () => this.teslaComms.isModuleAlive(moduleNumber))
            .then(alive => {
               if (alive) {
                  found.push(moduleNumber);
                  logger.debug(`Module ${moduleNumber} found`);
               } else {
                  missing.push(moduleNumber);
                  logger.warn(`Module ${moduleNumber} not found`);
               }
            });
      }

      logger.info(`Found modules: [${found.join(', ')}]` + (missing.length > 0 ? ` - missing: [${missing.join(', ')}]` : ''));
      return { found, missing };
   }

   async wakeModules() {
      logger.info("Waking all modules");
      return this.lock
         .acquire('key', async () =>
            this.teslaComms.writeByteToDeviceRegister(BROADCAST_ADDR, Registers.REG_IO_CONTROL, 0)
         )
         .then(() => sleep(2))
         .then(() => this.checkAllStatuses());
   }

   async sleep() {
      logger.info("Sleeping all modules");
      // puts all boards to slee
      return Object.values(this.modules).forEach(async module => await module.sleep());
   }

   hasAlert() {
      for (const index in this.modules) {
         if (!this.modules[index].alerts.equals(BQAlerts.none)) return true;
      }
      return false;
   }

   hasFault() {
      for (const index in this.modules) {
         if (!this.modules[index].faults.equals(BQFaults.none)) return true;
      }
      return false;
   }

   /**
    * Calculates the whole battery voltage from the voltage of each module
    */
   getVoltage() {
      const moduleVolts = Object.values(this.modules).map(module => module.moduleVolts)
      const sum = moduleVolts.reduce((acc, v) => acc + v, 0);
      return sum / (moduleVolts.length / 2);
   }

   getCapacityAh() {
      return this.config.battery.capacityPerModuleAh * this.config.battery.moduleCount / 2
   }

   getRemainingAh() {
      const bat = this.config.battery;
      const voltPercent = (this.getVoltage() - bat.voltsEmpty) / (bat.voltsFull - bat.voltsEmpty);
      return this.getCapacityAh() * voltPercent;
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
      const min = Math.min(...modules.map((m) => m.getMinTemperature()));
      const max = Math.max(...modules.map((m) => m.getMaxTemperature()));
      return {
         min,
         max,
         spread: max - min,
      };
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

   async checkAllStatuses() {
      logger.info("Checking statuses of all modules");
      for (const index in this.modules) {
         const faults = await this.lock.acquire('key', () => this.modules[index].readStatus());
         console.log('Module ' + index + ': ' + faults);
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

   async readAllIOControl() {
      for (const index in this.modules) {
         const ioc = await this.lock.acquire('key', () => this.modules[index].readIOControl());
         console.log(`Module ${index}: ${ioc}`);
      }
   }
}
