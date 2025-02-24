import { BMSPack } from './bms-pack';

enum BQRegisters {
   REG_DEV_STATUS = 0x00,
   REG_GPAI = 0x01,
   REG_VCELL1 = 0x03,
   REG_VCELL2 = 0x05,
   REG_VCELL3 = 0x07,
   REG_VCELL4 = 0x09,
   REG_VCELL5 = 0x0B,
   REG_VCELL6 = 0x0D,
   REG_TEMPERATURE1 = 0x0F,
   REG_TEMPERATURE2 = 0x11,
   REG_ALERT_STATUS = 0x20,
   REG_FAULT_STATUS = 0x21,
   REG_COV_FAULT = 0x22,
   REG_CUV_FAULT = 0x23,
   REG_ADC_CONTROL = 0x30,
   REG_IO_CONTROL = 0x31,
   REG_BAL_CTRL = 0x32,
   REG_BAL_TIME = 0x33,
   REG_ADC_CONVERT = 0x34,
   REG_ADDR_CTRL = 0x3B,
   REG_RESET = 0x3C,
   REG_FUNCTION_CONFIG = 0x40
}

class BMSBoard {
   // TODO: Move to class for the TI BQ76PL536A-Q1 chip
   // registers for bq76PL536A-Q1 (https://www.ti.com/lit/ds/symlink/bq76pl536a-q1.pdf)
   static Registers = BQRegisters;

   private pack: BMSPack;
   private id: number;
   private cellVoltages: (number | undefined)[];
   private temperatures: (number | undefined)[];
   private moduleVolt?: number;
   public alerts!: BQAlerts;
   public faults!: BQFaults;
   private covFaults!: number;
   private cuvFaults!: number;

   constructor(pack: BMSPack, id: number) {
      this.pack = pack;
      this.id = id;
      this.cellVoltages = new Array(6).fill(undefined);
      this.temperatures = new Array(2).fill(undefined);
   }

   async readBytesFromRegister(register: number, byteCount: number) {
      return this.pack.readBytesFromDeviceRegister(this.id, register, byteCount);
   }

   async writeByteToRegister(register: number, byte: number) {
      // console.log( "BMS Board: writeByteToRegister(register=" + register + ")" )

      return this.pack
         .writeByteToDeviceRegister(this.id, register, byte)
         .then(() => this.readFaults());
      // .then( (faults) => console.log( "Faults: " + faults ) )
   }

   async writeAlertStatus(alertStatus: BQAlerts) {
      return this.writeByteToRegister(BMSBoard.Registers.REG_ALERT_STATUS, alertStatus.getByte());
   }

   async readStatus() {
      var bytes = await this.readBytesFromRegister(BMSBoard.Registers.REG_ALERT_STATUS, 4);

      this.alerts = new BQAlerts(bytes[0]);
      this.faults = new BQFaults(bytes[1]);
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
      return this.writeIOControl(false, false, false, false, true, true).then(() =>
         this.readIOControl()
      );
      // turn on TS1, TS2
   }

   async readValues() {
      //ADC Auto mode, read every ADC input we can (Both Temps, Pack, 6 cells)
      //enable temperature measurement VSS pins
      //start all ADC conversions
      return (
         this.writeADCControl(false, true, true, true, 6)
            .then(() => this.writeIOControl(false, false, false, false, true, true)) // wait one ms here?
            .then(() => this.writeADCConvert(true))
            // .then(() => new Promise(resolve => setTimeout(() => resolve(), 1000))) // waiting one second to test
            .then(() => this.readMultiRegisters())
      );
   }

   async readConfig() {
      return this.readBytesFromRegister(BMSBoard.Registers.REG_FUNCTION_CONFIG, 8).then(
         bytes => {}
      );
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
      for (var i = 0; i < 6; i++) {
         this.cellVoltages[i] =
            ((bytes[2 + i * 2] * 256 + bytes[2 + i * 2 + 1]) * 6250) / (16383 * 1000);
         cellSum += this.cellVoltages[i];
      }

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
      auxConnected: boolean,
      gpioOutOpenDrain: boolean,
      gpioInHigh: boolean,
      sleep: boolean,
      ts1connected: boolean,
      ts2connected: boolean
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
         return new BQIOControl(bytes[0]);
      });
   }

   async writeADCControl(adcOn: boolean, tempSensor1On: boolean, tempSensor2On: boolean, gpaiOn: boolean, cellCount: number) {
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

   async writeADCConvert(initiateConversion: boolean) {
      return this.writeByteToRegister(
         BMSBoard.Registers.REG_ADC_CONVERT,
         initiateConversion ? 1 : 0
      );
   }

   // cells is array of 6 booleans, true to balance
   async balance(cells: boolean[]) {
      var regValue = 0;

      for (var i = 0; i < 6; i++) if (cells[i]) regValue = regValue | (1 << i);

      // console.log( "Module " + this.id + ": Writing " + regValue.toString(16) + " to REG_BAL_CTRL");
      return this.writeByteToRegister(BMSBoard.Registers.REG_BAL_CTRL, regValue);
   }

   // if not isSeconds, then the count is in minutes
   async setBalanceTimer(count: number, isSeconds: boolean) {
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
   private byteValue: number;
   constructor(byteValue: number) {
      this.byteValue = byteValue;
   }
   toString(): string {
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
   private byteValue: number;

   constructor(byteValue: number) {
      this.byteValue = byteValue;
   }

   getByte(): number {
      return this.byteValue;
   }

   equals(other: BQAlerts): boolean {
      var result = other.byteValue == this.byteValue;

      return result;
   }

   toString(): string {
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

   private byteValue: number;

   constructor(byteValue: number) {
      this.byteValue = byteValue;
   }

   equals(other: BQFaults): boolean {
      return other.byteValue == this.byteValue;
   }

   toString(): string {
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

export { BMSBoard, BQAlerts, BQFaults };
