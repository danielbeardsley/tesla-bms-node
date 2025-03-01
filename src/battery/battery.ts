import AsyncLock from 'async-lock';
import { TeslaModule, BQAlerts, BQFaults, Registers } from './tesla-module';
import { sleep } from '../utils';
import { TeslaComms, BROADCAST_ADDR } from './tesla-comms';
import type { Config } from '../config';

export class Battery {
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

   async init() {
      await this.initModules();
   }

   close() {
      this.teslaComms.close();
   }

   async initModules() {
      let moduleNumber: number;
      const missingModules: number[] = [];

      for (moduleNumber = 1; moduleNumber <= this.config.battery.moduleCount; moduleNumber++) {
         await this.lock
            .acquire('key', () => this.teslaComms.isModuleAlive(moduleNumber))
            .then(alive => {
               if (alive) {
                  this.modules[moduleNumber] = new TeslaModule(this.teslaComms, moduleNumber);
                  console.log(`Module ${moduleNumber} found`);
               } else {
                  missingModules.push(moduleNumber);
                  console.log(`Module ${moduleNumber} not found`);
               }
            });
      }

      if (missingModules.length > 0) {
         const message = `Unable to communicate with modules: ${missingModules.join(', ')}`;
         console.error(`${message}. Adjust config or use the renumber command`);
         throw new Error(message);
      }
   }

   async wakeModules() {
      return this.lock
         .acquire('key', async () =>
            this.teslaComms.writeByteToDeviceRegister(BROADCAST_ADDR, Registers.REG_IO_CONTROL, 0)
         )
         .then(() => sleep(2))
         .then(() => this.checkAllStatuses());
   }

   async sleep() {
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

   async stopBalancing() {
      const falses = [false, false, false, false, false, false];

      for (const index in this.modules) {
         await this.lock.acquire('key', () => this.modules[index].balance(falses));
      }
   }

   async checkAllStatuses() {
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
