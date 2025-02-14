const AsyncLock = require('async-lock');
const SerialWrapper = require('./src/serial-wrapper');

class BMSBoard {
   // TODO: Move to class for the TI BQ76PL536A-Q1 chip
   // registers for bq76PL536A-Q1 (https://www.ti.com/lit/ds/symlink/bq76pl536a-q1.pdf)
   static Registers = {
      REG_DEV_STATUS: 0,
      REG_GPAI: 1,
      REG_VCELL1: 3,
      REG_VCELL2: 5,
      REG_VCELL3: 7,
      REG_VCELL4: 9,
      REG_VCELL5: 0xb,
      REG_VCELL6: 0xd,
      REG_TEMPERATURE1: 0xf,
      REG_TEMPERATURE2: 0x11,
      REG_ALERT_STATUS: 0x20,
      REG_FAULT_STATUS: 0x21,
      REG_COV_FAULT: 0x22,
      REG_CUV_FAULT: 0x23,
      REG_ADC_CONTROL: 0x30,
      REG_IO_CONTROL: 0x31,
      REG_BAL_CTRL: 0x32,
      REG_BAL_TIME: 0x33,
      REG_ADC_CONVERT: 0x34,
      REG_ADDR_CTRL: 0x3b,
      REG_RESET: 0x3c,
      REG_FUNCTION_CONFIG: 0x40,
   };

   constructor(pack, id) {
      this.pack = pack;
      this.id = id;
      this.cellVoltages = [undefined, undefined, undefined, undefined, undefined, undefined];
      this.temperatures = [undefined, undefined];
   }

   async readBytesFromRegister(register, byteCount) {
      return this.pack.readBytesFromDeviceRegister(this.id, register, byteCount);
   }

   async writeByteToRegister(register, byte) {
      // console.log( "BMS Board: writeByteToRegister(register=" + register + ")" )

      return this.pack
         .writeByteToDeviceRegister(this.id, register, byte)
         .then(() => this.readFaults());
      // .then( (faults) => console.log( "Faults: " + faults ) )
   }

   async writeAlertStatus(alertStatus) {
      return this.writeByteToRegister(BMSBoard.Registers.REG_ALERT_STATUS, alertStatus.getByte());
   }

   async readStatus() {
      console.log('reading status');
      var bytes = await this.readBytesFromRegister(BMSBoard.Registers.REG_ALERT_STATUS, 4);
      console.log('status bytes=', bytes);

      this.alerts = new BQAlerts(bytes[0]);
      console.log( "Alerts: " + this.alerts )
      this.faults = new BQFaults(bytes[1]);
      console.log( "Faults: " + this.faults )
      this.covFaults = bytes[2];
      this.cuvFaults = bytes[3];
   }

   async sleep() {
      // write 1 to IO_CONTROL[SLEEP]
      // turns off TS1, TS2, enter sleep mode
      return (
         this.writeIOControl(false, false, false, true, false, false)
            // write 1 to ALERT[SLEEP]
            .then(() => this.writeAlertStatus(BQAlerts.sleep)) // false, false, false, false, false, true, false, false ) )
            // write 0 to ALERT[SLEEP]
            .then(() => this.writeAlertStatus(BQAlerts.none))
      ); // false, false, false, false, false, true, false, false ) )
   }

   async wake() {
      // write 0 to IO_CONTROL[SLEEP]
      return this.writeIOControl(false, false, false, false, true, true)
         .then(() => this.readIOControl())
         .then(ioc => console.log('IOControl after wake: ' + ioc));
      // turn on TS1, TS2
   }

   async readValues() {
      //ADC Auto mode, read every ADC input we can (Both Temps, Pack, 6 cells)
      //enable temperature measurement VSS pins
      //start all ADC conversions
      return this.writeADCControl(false, true, true, true, 6)
         .then(() => this.writeIOControl(false, false, false, false, true, true)) // wait one ms here?
         .then(() => this.writeADCConvert(true))
         // .then(() => new Promise(resolve => setTimeout(() => resolve(), 1000))) // waiting one second to test
         .then(() => this.readMultiRegisters());
   }

   async readConfig() {
      return this.readBytesFromRegister(BMSBoard.Registers.REG_FUNCTION_CONFIG, 8).then(bytes => {
         console.log('Configuration:');
         for (var i = 0; i < 8; i++) console.log(i + ': ' + bytes[i]);
      });
   }

   // async readVoltages()
   // {
   // 	var bytes = await this.readBytesFromRegister( BMSBoard.Registers.REG_ALERT_STATUS, 4 );
   // }

   async readMultiRegisters() {
      const bytes = await this.readBytesFromRegister(BMSBoard.Registers.REG_GPAI, 18);
      var tempTemp, tempCalc, logTempTemp;
      var cellSum = 0;

      this.moduleVolt = ((bytes[0] * 256 + bytes[1]) * 6.25) / (0.1875 * 2 ** 14); // 0.002034609;
      console.log( "moduleVolt = " + this.moduleVolt + "(" + bytes[0] + ", " + bytes[1] + ")" );
      console.log('readMultiRegisters: bytes=' + bytes);
      for (var i = 0; i < 6; i++) {
         this.cellVoltages[i] =
            ((bytes[2 + i * 2] * 256 + bytes[2 + i * 2 + 1]) * 6250) / (16383 * 1000);
         cellSum += this.cellVoltages[i];
         console.log(
            'Cell voltage ' +
               i +
               ' = ' +
               this.cellVoltages[i] +
               '(' +
               bytes[2 + i * 2] +
               ', ' +
               bytes[2 + i * 2 + 1]
         ) + ')';
      }

      // console.log( "Sum of cells: " + cellSum )
      tempTemp = 1.78 / ((bytes[14] * 256 + bytes[15] + 2) / 33046.0) - 3.57;

      tempTemp = tempTemp * 1000;
      logTempTemp = Math.log(tempTemp);
      tempCalc =
         1.0 /
         (0.0007610373573 + 0.0002728524832 * logTempTemp + logTempTemp ** 3 * 0.0000001022822735);
      this.temperatures[0] = tempCalc - 273.15;
      // console.log( "Temp1 bytes=" + bytes[14] + ", " + bytes[15] + " = " + (bytes[14] * 256 + bytes[15]) )

      // TODO: This is from Arduino code, the constant for division is different above and below, which is right? Also the +2 looks strange
      tempTemp = 1.78 / ((bytes[16] * 256 + bytes[17] + 2) / 33068.0) - 3.57;
      tempTemp = tempTemp * 1000;
      logTempTemp = Math.log(tempTemp);
      tempCalc =
         1.0 /
         (0.0007610373573 + 0.0002728524832 * logTempTemp + logTempTemp ** 3 * 0.0000001022822735);
      this.temperatures[1] = tempCalc - 273.15;
      // console.log( "Temp1 bytes=" + bytes[16] + ", " + bytes[17] + " = " + (bytes[16] * 256 + bytes[17]) )

      // console.log( "Temperatures: " + this.temperatures[0] + ", " + this.temperatures[1] )

      //turning the temperature wires off here seems to cause weird temperature glitches
   }

   getMinVoltage() {
      console.log('Module min voltage: ' + Math.min(...this.cellVoltages));
      return Math.min(...this.cellVoltages);
   }

   getMaxTemperature() {
      return Math.max(...this.temperatures);
   }

   async readFaults() {
      return this.readBytesFromRegister(BMSBoard.Registers.REG_FAULT_STATUS, 1).then(
         bytes => new BQFaults(bytes[0])
      );
   }

   async writeIOControl(
      auxConnected,
      gpioOutOpenDrain,
      gpioInHigh,
      sleep,
      ts1connected,
      ts2connected
   ) {
      var value;

      value =
         (auxConnected ? 1 << 7 : 0) |
         (gpioOutOpenDrain ? 1 << 6 : 0) |
         (gpioInHigh ? 1 << 5 : 0) |
         (sleep ? 1 << 2 : 0) |
         (ts2connected ? 1 << 1 : 0) |
         (ts1connected ? 1 : 0);

      // console.log( "writeIOControl: ts1connected = " + ts1connected + ", value=" + value );
      return this.writeByteToRegister(BMSBoard.Registers.REG_IO_CONTROL, value);
   }

   async readIOControl() {
      return this.readBytesFromRegister(BMSBoard.Registers.REG_IO_CONTROL, 1).then(bytes => {
         console.log('IOControl bytes=' + bytes);
         return new BQIOControl(bytes[0]);
      });
   }

   async writeADCControl(adcOn, tempSensor1On, tempSensor2On, gpaiOn, cellCount) {
      var value;

      value =
         (adcOn ? 1 << 6 : 0) |
         (tempSensor2On ? 1 << 5 : 0) |
         (tempSensor1On ? 1 << 4 : 0) |
         (gpaiOn ? 1 << 3 : 0);

      if (cellCount > 1 && cellCount <= 6) value |= cellCount - 1;

      // console.log( "writeADCControl(tempSensor1On=" + tempSensor1On+ "), value=" + value.toString(2) );
      return this.writeByteToRegister(BMSBoard.Registers.REG_ADC_CONTROL, value);
   }

   async writeADCConvert(initiateConversion) {
      return this.writeByteToRegister(
         BMSBoard.Registers.REG_ADC_CONVERT,
         initiateConversion ? 1 : 0
      );
   }

   // cells is array of 6 booleans, true to balance
   async balance(cells) {
      var regValue = 0;

      for (var i = 0; i < 6; i++) if (cells[i]) regValue = regValue | (1 << i);

      // console.log( "Module " + this.id + ": Writing " + regValue.toString(16) + " to REG_BAL_CTRL");
      return this.writeByteToRegister(BMSBoard.Registers.REG_BAL_CTRL, regValue);
   }

   // if not isSeconds, then the count is in minutes
   async setBalanceTimer(count, isSeconds) {
      if (count >= 64) throw 'Invalid count, must be 0-63';

      var regValue = count | (isSeconds ? 0 : 1 << 7);

      // console.log( "Setting balance timer: " + count + (isSeconds ? " s" : " min"));

      return this.writeByteToRegister(BMSBoard.Registers.REG_BAL_TIME, regValue);
   }

   toString() {
      return 'BMSBoard #' + this.id;
   }
}

class BQIOControl {
   constructor(byteValue) {
      this.byteValue = byteValue;
   }
   toString() {
      var result = 'IO Control: Aux: ';
      if (this.byteValue & (1 << 7)) result += ' connected to REG50, ';
      else result += ' Open, ';

      result += 'GPIO_out: ';

      if (this.byteValue & (1 << 6)) result += ' open-drain, ';
      else result += ' output low, ';

      result += 'GPIO_in: ';

      if (this.byteValue & (1 << 5)) result += ' is high, ';
      else result += ' is low, ';

      result += 'Sleep: ';

      if (this.byteValue & (1 << 2)) result += ' Sleep mode, ';
      else result += ' Active mode, ';

      result += 'TS2: ';
      if (this.byteValue & (1 << 1)) result += ' Connected';
      else result += ' Not connected';

      result += 'TS1: ';
      if (this.byteValue & (1 << 0)) result += ' Connectetd';
      if (this.byteValue == 0) result += ' Not connected';

      return result;
   }
}

class BitmapField {
   // maps bit to symbolic name
   // { 0: 'jet engine enabled', 1: 'black hole collapsing' }
   constructor(name, bits) {
      this.name = name;
      this.bits = bits;
      this.fields = {};
      for (bit in bits) this.fields[this.bits[bit]] = bit;
   }

   setFields(fieldValues, value) {
      for (field in fieldValues) {
         if (field in this.bitmap.fields) {
            var bit = this.bitmap.fields[field];
            var mask = 1 << bit;

            value = value & ~mask; // reset bit
            if (fieldValues[field]) value = value | mask;
         } else throw "Unrecognized field '" + field + "'";
      }

      return value;
   }
}

class BitmapValue {
   constructor(bitmap) {
      this.bitmap = bitmap;
      this.value = 0;
   }

   setValue(value) {
      this.value = 0;
   }

   setFields(fields) {
      this.value = this.bitmap.setFields(fields, value);
   }
   getValue() {
      return this.value;
   }
   getFields() {
      return this.bitmap.getFields(value);
   }

   toString() {
      return 'NIY';
   }
}

class BQAlerts {
   static sleep = new BQAlerts(1 << 2);
   static none = new BQAlerts(0);
   /*
	static createFrom( ar, parity, ecc_err, force, tsd, sleep, ot2, ot1 )
	{
		var byteValue = 0;
		if( ar )
			byteValue |= 1 << 7;
		if( parity )
			byteValue |= 1 << 6;
		if( ecc_err )
			byteValue |= 1 << 
	}
*/
   constructor(byteValue) {
      this.byteValue = byteValue;
   }

   getByte() {
      return this.byteValue;
   }

   equals(other) {
      var result = other.byteValue == this.byteValue;

      return result;
   }

   toString() {
      var result = 'Alerts: ';
      if (this.byteValue & (1 << 7)) result += ' Address has not been assigned';
      if (this.byteValue & (1 << 6)) result += ' Group 3 protected registers are invalid';
      if (this.byteValue & (1 << 5)) result += ' Uncorrectable EPROM error';
      if (this.byteValue & (1 << 4)) result += ' Alert asserted';
      if (this.byteValue & (1 << 3)) result += ' Thermal shutdown';
      if (this.byteValue & (1 << 2)) result += ' Sleep mode was activated';
      if (this.byteValue & (1 << 1)) result += ' Overtemperature on TS2';
      if (this.byteValue & (1 << 0)) result += ' Overtemperature on TS1';
      if (this.byteValue == 0) result += ' None';

      return result;
   }
}

class BQFaults {
   static none = new BQFaults(0);

   constructor(byteValue) {
      this.byteValue = byteValue;
   }

   equals(other) {
      return other.byteValue == this.byteValue;
   }

   toString() {
      var result = 'Faults: ';
      if (this.byteValue & (1 << 5)) result += ' Internal Consistency Check Failed';
      if (this.byteValue & (1 << 4)) result += ' Fault Forced';
      if (this.byteValue & (1 << 3)) result += ' Power-on-reset occurred';
      if (this.byteValue & (1 << 2)) result += ' CRC error detected in last packet';
      if (this.byteValue & (1 << 1)) result += ' Undervoltage';
      if (this.byteValue & (1 << 0)) result += ' Overvoltage';
      if (this.byteValue == 0) result += ' None';

      return result;
   }
}

class BMSPack {
   // static MAX_MODULE_ADDR = 0x3e
   static MAX_MODULE_ADDR = 0x0A;
   static BROADCAST_ADDR = 0x3f;

   constructor(serialDevice) {
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
      // lock handling is in pollModule
      var x;
      // var modules = []

      console.log( "findBoards entry" );
      for (x = 1; x < BMSPack.MAX_MODULE_ADDR; x++) {
         console.log('Looking for board ' + x);
         await this.pollModule(x).then(module => {
            console.log('pollModule returned:', module);
            if (module) {
               console.log( "module: " + module );
               this.modules[x] = module;
            }
         });
      }
      console.log('findBoards exit');
      console.log('this.modules=', this.modules);
      // console.log( this.modules );
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
   async setBalanceTimer(seconds) {
      const isSeconds = seconds < 63;
      var count;

      if (isSeconds) count = seconds;
      else count = Math.ceil(seconds / 60);

      for (var index in this.modules)
         await this.lock.acquire('key', () =>
            this.modules[index].setBalanceTimer(count, isSeconds)
         );
   }

   // cells is two-dimensional array of booleans
   async balance(cells) {
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
      console.log('Checking all statuses');
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
      console.log('Reading all IO Control');
      for (var index in this.modules) {
         var ioc = await this.lock.acquire('key', () => this.modules[index].readIOControl());
         // console.log( "Module " + index + ": " + ioc );
      }
   }

   async pollModule(number) {
      var sendData = [number << 1, 0, 1]; // bytes to send

      console.log("aquiring lock for module " + number);
      return this.lock
         .acquire('key', async () => {
            console.log("lock aquired for module " + number);
            console.log('Polling module ' + number, 'sending:', sendData);
            await this.serial.write(sendData);
            await sleep(40);

            return this.serial.readAll();
         })
         .then(reply => {
            console.log('Found module #' + number + ': ', reply);
            if (reply.length > 4) {
               return new BMSBoard(this, number);
            } else {
               // console.log( "No module #" + number );
               return null;
            }
         });
   }

   crc(data) {
      const generator = 0x07;
      var crc;
      var finalCRC;

      finalCRC = data.reduce((crc, byte) => {
         // console.log( "data.reduce: crc=0x" + crc.toString(16) + ", byte=0x" + byte.toString(16) );
         crc = crc ^ byte;
         // console.log( "After xor, crc=0x" + crc.toString(16) );
         for (var i = 0; i < 8; i++) {
            if ((crc & 0x80) != 0) crc = ((crc << 1) & 0xff) ^ generator;
            else crc = (crc << 1) & 0xff;
            // console.log( "temp crc=0x" + crc.toString(16));
         }
         return crc;
      }, 0x00);

      // console.log( "CRC on " + data + " = 0x" + finalCRC.toString(16) );

      return finalCRC;
   }

   async readBytesFromDeviceRegister(device, register, byteCount) {
      var sendData = [device << 1, register, byteCount]; // bytes to send

      // TODO: add CRC check, retry on failed, return as soon as all data received
      return this.serial.write(sendData).then(async () => {
         var data = await this.serial.readBytes(byteCount + 4);
         var crc = this.crc(data.slice(0, byteCount + 3));
         // console.log( "Received data=" + data );
         if (data.length == byteCount + 4) {
            if (data[0] != sendData[0])
               throw 'first byte is ' + data[0] + ', not device id ' + device;
            if (data[1] != register)
               throw 'second byte is ' + data[1] + ', not register ' + register;
            if (data[2] != byteCount)
               throw 'third byte is ' + data[2] + ', not byte count ' + byteCount;
            if (data[data.length - 1] != crc)
               throw 'last byte is ' + data[data.length - 1] + ', not expected crc ' + crc;
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

   async writeByteToDeviceRegister(device, register, byte) {
      var sendData = [(device << 1) | 1, register, byte]; // bytes to send

      sendData.push(this.crc(sendData));
      console.log('writeBytesToDeviceRegister: register=' + register, sendData);
      // console.log( "writeBytes: sendData: " + sendData );
      this.serial.flushInput();
      return this.serial.write(sendData).then(async () => {
         const reply = await this.serial.readBytes(sendData.length);
         console.log('writeBytes: received ', reply);

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

var pack = new BMSPack('/dev/ttyUSB0');

initPack(pack)
   .then(() => pack.wakeBoards())
   .then(async () => {
      console.log(pack.modules);
      //await pack.stopBalancing();
      for (var key in pack.modules) {
         console.log('key: ' + key);
         var module = pack.modules[key];
         console.log('module: ' + module);
         await module
            .readIOControl()
            .then(ioControl => {
               console.log(ioControl);
            })
            .then(() => {
               console.log('Reading status...');
               return module.readStatus();
            })
            .then(() => {
               console.log('Reading values...');
               return module.readValues();
            })
            .then(() => {
               console.log('Reading config...');
               return module.readConfig();
            })
            .then(() => {
               console.log('Sleeping module...');
               return module.sleep();
            })
            .then(() => {
               console.log('Reading status again...');
               // return module.readStatus();
            })
            .then(() => {
               console.log(module.cellVoltages);
               console.log(module.temperatures);
            });
      }
   })
   .then(async () => {
      while(true) {
         try {
            await pack.modules[1].readValues();
         } catch (error) {
            console.error('Error reading values: ', error);
         }
         await sleep(1000);
      }
   })
   .catch(error => {
      console.error('Error: ', error);
   });

async function initPack(pack) {
   console.log('before pack.init()');
   await pack.init();
   console.log('after pack.init()');
}

async function sleep(ms) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
   BMSPack: BMSPack,
   BQAlerts: BQAlerts,
   BQFaults: BQFaults,
};
