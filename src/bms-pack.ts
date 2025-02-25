import AsyncLock from 'async-lock';
import { SerialWrapper } from './serial-wrapper';
import { TeslaModule, BQAlerts, BQFaults, Registers } from './tesla-module';
import { sleep } from './utils';
import { TeslaComms, BROADCAST_ADDR } from './tesla-comms';

export class BMSPack {
   // static MAX_MODULE_ADDR = 0x3e
   static MAX_MODULE_ADDR = 0x0a;

   public modules: { [key: number]: TeslaModule };
   private serial: SerialWrapper;
   private lock: AsyncLock;
   private teslaComms: TeslaComms;

   constructor(serialDevice: string) {
      this.serial = new SerialWrapper(serialDevice, 612500);
      this.teslaComms = new TeslaComms(this.serial);
      // Apperently, some modules can run at 631578
      // this.serial = new SerialWrapper(serialDevice, 631578 );
      this.modules = {};
      this.lock = new AsyncLock();
   }

   async init() {
      // console.log( "Pack.init entry" );
      return this.serial.open().then(() => {
         return this.findBoards();
      });
      // console.log( "Pack.init exit" );
   }

   close() {
      this.serial.close();
   }

   async findBoards() {
      let x: number;

      for (x = 1; x < BMSPack.MAX_MODULE_ADDR; x++) {
         await this.lock.acquire('key', () =>
            this.teslaComms.pollModule(x)
         ).then(module => {
            if (module) {
               this.modules[x] = new TeslaModule(this.teslaComms, module);
               console.log(`Module ${x} found`);
            } else {
               console.log(`Module ${x} not found`)
            }
         }).catch(() => {
            console.log(`Error polling module ${x}`);
         });
      }
   }

   async renumberBoardIDs() {}

   async wakeBoards() {
      return (
         this.lock
            .acquire('key', async () =>
               this.teslaComms.writeByteToDeviceRegister(
                  BROADCAST_ADDR,
                  Registers.REG_IO_CONTROL,
                  0
               )
            )
            // return this.lock.acquire( 'key', () => 1)
            .then(() => sleep(2))
            .then(() => this.checkAllStatuses())
            .then(() => this.readAllIOControl())
            .then(() =>
               this.lock.acquire('key', async () =>
                  this.teslaComms.writeByteToDeviceRegister(
                     BROADCAST_ADDR,
                     Registers.REG_ALERT_STATUS,
                     0x04
                  )
               )
            )
            .then(() => sleep(2))
            .then(() => this.checkAllStatuses())
            .then(() =>
               this.lock.acquire('key', async () =>
                  this.teslaComms.writeByteToDeviceRegister(
                     BROADCAST_ADDR,
                     Registers.REG_ALERT_STATUS,
                     0
                  )
               )
            )
            .then(() => sleep(2))
            .then(() => this.checkAllStatuses())
            .then(() => console.log('Boards should be awake'))
      );
   }

   async sleep() {
      // puts all boards to slee
      return Object.values(this.modules).forEach(async module => await module.sleep());
   }

   hasAlert() {
      for (var index in this.modules)
         if (!this.modules[index].alerts.equals(BQAlerts.none)) return true;
      return false;
   }

   hasFault() {
      for (var index in this.modules)
         if (!this.modules[index].faults.equals(BQFaults.none)) return true;
      return false;
   }

   getMinVoltage() {
      console.log('getMinVoltage: values=' + Object.values(this.modules));
      return Object.values(this.modules).reduce((result, module) => {
         var v = module.getMinVoltage();
         if (v < result) return v;
         else return result;
      }, 5);
   }

   getMaxTemperature() {
      return Object.values(this.modules).reduce((result, module) => {
         var temperature = module.getMaxTemperature();
         if (temperature > result) return temperature;
         else return result;
      }, 0);
   }

   async stopBalancing() {
      const falses = [false, false, false, false, false, false];

      for (var index in this.modules)
         await this.lock.acquire('key', () => this.modules[index].balance(falses));
   }

   async checkAllStatuses() {
      for (var index in this.modules) {
         var faults = await this.lock.acquire('key', () => this.modules[index].readStatus());
         console.log( "Module " + index + ": " + faults );
      }
   }

   async readAll() {
      for (var key in this.modules) {
         var module = this.modules[key];
         await this.lock.acquire('key', () =>
            module
               .readStatus() // this reads faults and alerts
               .then(() => module.readValues())
         ); // this reads temperatures and voltages
      }
   }

   async readAllIOControl() {
      for (var index in this.modules) {
         var ioc = await this.lock.acquire('key', () => this.modules[index].readIOControl());
         console.log( "Module " + index + ": " + ioc );
      }
   }
}
