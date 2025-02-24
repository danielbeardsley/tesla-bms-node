import AsyncLock from 'async-lock';
import { SerialWrapper } from './serial-wrapper';
import { BMSBoard, BQAlerts, BQFaults } from './bms-board';
import { sleep, crc } from './utils';

export class BMSPack {
   // static MAX_MODULE_ADDR = 0x3e
   static MAX_MODULE_ADDR = 0x0a;
   static BROADCAST_ADDR = 0x3f;

   public modules: { [key: number]: BMSBoard };
   private serial: SerialWrapper;
   private lock: AsyncLock;

   constructor(serialDevice: string) {
      this.serial = new SerialWrapper(serialDevice, 612500);
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
         await this.pollModule(x).then(module => {
            if (module) {
               this.modules[x] = module;
            }
         });
      }
   }

   async renumberBoardIDs() {}

   async wakeBoards() {
      return (
         this.lock
            .acquire('key', async () =>
               this.writeByteToDeviceRegister(
                  BMSPack.BROADCAST_ADDR,
                  BMSBoard.Registers.REG_IO_CONTROL,
                  0
               )
            )
            // return this.lock.acquire( 'key', () => 1)
            .then(() => sleep(2))
            .then(() => this.checkAllStatuses())
            .then(() => this.readAllIOControl())
            .then(() =>
               this.lock.acquire('key', async () =>
                  this.writeByteToDeviceRegister(
                     BMSPack.BROADCAST_ADDR,
                     BMSBoard.Registers.REG_ALERT_STATUS,
                     0x04
                  )
               )
            )
            .then(() => sleep(2))
            .then(() => this.checkAllStatuses())
            .then(() =>
               this.lock.acquire('key', async () =>
                  this.writeByteToDeviceRegister(
                     BMSPack.BROADCAST_ADDR,
                     BMSBoard.Registers.REG_ALERT_STATUS,
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

   //
   async setBalanceTimer(seconds: number) {
      const isSeconds = seconds < 63;
      let count: number;

      if (isSeconds) count = seconds;
      else count = Math.ceil(seconds / 60);

      for (const index in this.modules) {
         await this.lock.acquire('key', () =>
            this.modules[index].setBalanceTimer(count, isSeconds)
         );
      }
   }

   // cells is two-dimensional array of booleans
   async balance(cells: boolean[][]) {
      for (var index in this.modules) {
         const subCells = cells[index];

         if (subCells.reduce((acc, current) => current || acc, false)) {
            let success = false;
            while (!success)
               try {
                  await this.lock.acquire('key', () => this.modules[index].balance(subCells));
                  success = true;
               } catch (error) {
                  // todo: limit number of retries
                  console.log(
                     'Call to balance module ' + index + ' failed.: ' + error.stack + ', retrying'
                  );
                  await sleep(50);
               }
         }
      }
   }

   async stopBalancing() {
      const falses = [false, false, false, false, false, false];

      for (var index in this.modules)
         await this.lock.acquire('key', () => this.modules[index].balance(falses));
   }

   async checkAllStatuses() {
      for (var index in this.modules) {
         var faults = await this.lock.acquire('key', () => this.modules[index].readStatus());
         // console.log( "Module " + index + ": " + faults );
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
         // console.log( "Module " + index + ": " + ioc );
      }
   }

   async pollModule(number: number) {
      var sendData = [number << 1, 0, 1]; // bytes to send

      return this.lock
         .acquire('key', async () => {
            await this.serial.write(sendData);
            await sleep(40);

            return this.serial.readAll();
         })
         .then(reply => {
            if (reply.length > 4) {
               console.log('Found module #' + number + ': ', reply);
               return new BMSBoard(this, number);
            } else {
               // console.log( "No module #" + number );
               return null;
            }
         });
   }

   async readBytesFromDeviceRegister(device: number, register: number, byteCount: number) {
      var sendData = [device << 1, register, byteCount];

      // TODO: add CRC check, retry on failed, return as soon as all data received
      return this.serial.write(sendData).then(async () => {
         var data = await this.serial.readBytes(byteCount + 4);
         var checksum = crc(data.slice(0, byteCount + 3));
         if (data.length == byteCount + 4) {
            if (data[0] != sendData[0])
               throw 'first byte is ' + data[0] + ', not device id ' + device;
            if (data[1] != register)
               throw 'second byte is ' + data[1] + ', not register ' + register;
            if (data[2] != byteCount)
               throw 'third byte is ' + data[2] + ', not byte count ' + byteCount;
            if (data[data.length - 1] != checksum)
               throw 'last byte is ' + data[data.length - 1] + ', not expected crc ' + checksum;
            return data.slice(3, 3 + byteCount);
         } else
            throw (
               'readBytesFromDeviceRegister: Expected ' +
               (byteCount + 4) +
               ' bytes, got ' +
               data.length
            );
      });
   }

   async writeByteToDeviceRegister(device: number, register: number, byte: number) {
      var sendData = [(device << 1) | 1, register, byte];

      sendData.push(crc(sendData));
      this.serial.flushInput();
      return this.serial.write(sendData).then(async () => {
         const reply = await this.serial.readBytes(sendData.length);

         if (reply.length != sendData.length)
            throw (
               'writeByteToDeviceRegistr: Expected ' +
               sendData.length +
               ' bytes, got ' +
               reply.length
            );
         for (var i = 0; i < reply.length; i++)
            if (reply[i] != sendData[i])
               throw 'Expected byte ' + i + ' to be ' + sendData[i] + ', was ' + reply[i];
      });
   }
}
