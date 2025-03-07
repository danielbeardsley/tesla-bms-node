import { TeslaComms } from './tesla-comms';
import { bytesToUint16s, sleep } from '../utils';
import { logger } from '../logger';

// TODO: Move to class for the TI BQ76PL536A-Q1 chip
// registers for bq76PL536A-Q1 (https://www.ti.com/lit/ds/symlink/bq76pl536a-q1.pdf)
export enum Registers {
   REG_DEV_STATUS = 0x00,
   REG_GPAI = 0x01,
   REG_VCELL1 = 0x03,
   REG_VCELL2 = 0x05,
   REG_VCELL3 = 0x07,
   REG_VCELL4 = 0x09,
   REG_VCELL5 = 0x0b,
   REG_VCELL6 = 0x0d,
   REG_TEMPERATURE1 = 0x0f,
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
   REG_ADDR_CTRL = 0x3b,
   REG_RESET = 0x3c,
   REG_FUNCTION_CONFIG = 0x40,
}

class TeslaModule {
   private teslaComms: TeslaComms;
   private id: number;
   public cellVoltages: number[];
   public temperatures: number[];
   public moduleVolts?: number;
   public alerts!: BQAlerts;
   public faults!: BQFaults;
   public covFaults!: number;
   public cuvFaults!: number;

   constructor(teslaComms: TeslaComms, id: number) {
      this.teslaComms = teslaComms;
      this.id = id;
      this.cellVoltages = new Array(6).fill(0);
      this.temperatures = new Array(2).fill(0);
   }

   async readBytesFromRegister(register: number, byteCount: number) {
      return this.teslaComms.readBytesFromDeviceRegister(this.id, register, byteCount);
   }

   async writeByteToRegister(register: number, byte: number) {
      return this.teslaComms
         .writeByteToDeviceRegister(this.id, register, byte)
         .then(() => this.readFaults());
   }

   async writeAlertStatus(alertStatus: BQAlerts) {
      return this.writeByteToRegister(Registers.REG_ALERT_STATUS, alertStatus.getByte());
   }

   async readStatus() {
      const bytes = await this.readBytesFromRegister(Registers.REG_ALERT_STATUS, 4);
      logger.verbose('Read status for module %d', this.id);
      logger.debug('Status: %s', bytes.join(', '));
      this.alerts = new BQAlerts(bytes[0]);
      this.faults = new BQFaults(bytes[1]);
      this.covFaults = bytes[2];
      this.cuvFaults = bytes[3];
   }

   async sleep() {
      logger.verbose('Sleeping module %d', this.id);
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
      logger.verbose('Waking module %d', this.id);
      // write 0 to IO_CONTROL[SLEEP]
      return this.writeIOControl(false, false, false, false, true, true).then(() =>
         this.readIOControl()
      );
      // turn on TS1, TS2
   }

   async readValues() {
      logger.verbose('Reading values for module %d', this.id);
      //ADC Auto mode, read every ADC input we can (Both Temps, Pack, 6 cells)
      //enable temperature measurement VSS pins
      //start all ADC conversions
      return this.writeADCControl(false, true, true, true, 6)
         .then(() => this.writeIOControl(false, false, false, false, true, true)) // wait one ms here?
         .then(() => this.writeADCConvert(true))
         .then(() => this.readMultiRegisters());
   }

   /**
   async readConfig() {
      return this.readBytesFromRegister(Registers.REG_FUNCTION_CONFIG, 8).then(
         bytes => {}
      );
   }
   */

   async readMultiRegisters() {
      logger.debug('Reading multi registers for module %d', this.id);
      const bytes = await this.readBytesFromRegister(Registers.REG_GPAI, 18);

      const uint16s = bytesToUint16s(bytes);

      this.moduleVolts = uint16s[0] * (6.25 / (0.1875 * 2 ** 14)); // 0.002034609;
      for (let i = 0; i < 6; i++) {
         const cellVoltage = uint16s[i + 1] * (6250 / (16383 * 1000));
         this.cellVoltages[i] = cellVoltage;
      }

      this.temperatures[0] = this.convertUint16ToTemp(uint16s[7]);
      this.temperatures[1] = this.convertUint16ToTemp(uint16s[8]);
      logger.verbose('Module %d: cell volts: %s temps: %s', this.id, this.cellVoltagesString(), this.temperaturesString());
   }

   private convertUint16ToTemp(uint16: number) {
      const tempTemp = (1.78 / ((uint16 + 2) / 33046.0) - 3.57) * 1000;
      const logTempTemp = Math.log(tempTemp);
      const tempCalc =
         1.0 /
         (0.0007610373573 + 0.0002728524832 * logTempTemp + 0.0000001022822735 * logTempTemp ** 3);
      return tempCalc - 273.15;
   }

   getMinVoltage() {
      return Math.min(...this.cellVoltages);
   }

   getMaxVoltage() {
      return Math.max(...this.cellVoltages);
   }

   getMaxTemperature() {
      return Math.max(...this.temperatures);
   }

   getMinTemperature() {
      return Math.min(...this.temperatures);
   }

   cellVoltagesString() {
      return this.cellVoltages.map(v => v.toFixed(3)).join(', ');
   }

   temperaturesString() {
      return this.temperatures.map(t => t.toFixed(1)).join(', ');
   }

   async readFaults() {
      logger.debug('Reading faults for module %d', this.id);
      return this.readBytesFromRegister(Registers.REG_FAULT_STATUS, 1).then(
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
      const value =
         (auxConnected ? 1 << 7 : 0) |
         (gpioOutOpenDrain ? 1 << 6 : 0) |
         (gpioInHigh ? 1 << 5 : 0) |
         (sleep ? 1 << 2 : 0) |
         (ts2connected ? 1 << 1 : 0) |
         (ts1connected ? 1 : 0);

      logger.verbose('Writing IO control for module %d: aux: %s gpioOut: %s gpioIn: %s sleep: %s ts1: %s ts2: %s', this.id, auxConnected, gpioOutOpenDrain, gpioInHigh, sleep, ts1connected, ts2connected);
      return this.writeByteToRegister(Registers.REG_IO_CONTROL, value);
   }

   async readIOControl() {
      logger.verbose('Reading IO control for module %d', this.id);
      return this.readBytesFromRegister(Registers.REG_IO_CONTROL, 1).then(bytes => {
         return new BQIOControl(bytes[0]);
      });
   }

   async writeADCControl(
      adcOn: boolean,
      tempSensor1On: boolean,
      tempSensor2On: boolean,
      gpaiOn: boolean,
      cellCount: number
   ) {
      let value =
         (adcOn ? 1 << 6 : 0) |
         (tempSensor1On ? 1 << 4 : 0) |
         (tempSensor2On ? 1 << 5 : 0) |
         (gpaiOn ? 1 << 3 : 0);

      if (cellCount > 1 && cellCount <= 6) value |= cellCount - 1;

      logger.verbose('Writing ADC control for module %d: adcOn: %s temp1: %s temp2: %s gpai: %s cellCount: %s', this.id, adcOn, tempSensor1On, tempSensor2On, gpaiOn, cellCount);
      return this.writeByteToRegister(Registers.REG_ADC_CONTROL, value);
   }

   async writeADCConvert(initiateConversion: boolean) {
      logger.verbose('Writing ADC conversion for module %d: %s', this.id, initiateConversion ? 'on' : 'off');
      return this.writeByteToRegister(Registers.REG_ADC_CONVERT, initiateConversion ? 1 : 0);
   }

   async isModuleAlive(): Promise<boolean> {
      logger.verbose('Checking if module %d is alive', this.id);
      return this.teslaComms.readBytesFromDeviceRegister(this.id, Registers.REG_DEV_STATUS, 1, 40)
         .then(() => true)
         .catch(() => false);
   }

   async balanceCellsAbove(balanceAboveV: number, balanceTimeSec: number): Promise<number> {
      const shouldBalance = this.cellVoltages.map(v => v > balanceAboveV);
      logger.verbose('Balancing module %d, cells need balancing? %s', this.id, shouldBalance.join(', '));
      if (shouldBalance.some(b => b)) {
         await this.setBalanceTimer(balanceTimeSec);
         await this.balance(shouldBalance);
      }
      return shouldBalance.filter(should => should).length;
   }

   async stopBalancing() {
      return this.writeByteToRegister(Registers.REG_BAL_CTRL, 0);
   }

   // cells is array of 6 booleans, true to balance
   async balance(cells: boolean[]) {
      logger.verbose('Balancing module %d cells: %s', this.id, cells.join(', '));
      let regValue = 0;

      for (let i = 0; i < 6; i++) if (cells[i]) regValue = regValue | (1 << i);

      // console.log( "Module " + this.id + ": Writing " + regValue.toString(16) + " to REG_BAL_CTRL");
      return this.writeByteToRegister(Registers.REG_BAL_CTRL, regValue);
   }

   async setBalanceTimer(seconds: number) {
      if (seconds > 60 * 60) throw new Error('Invalid balance timer, must be 0-3600');

      // if seconds is greater than 60, we set the top bit to 1 to indicate minutes
      const regValue = seconds > 60 ? Math.floor(seconds / 60) | (1 << 7) : seconds;

      return this.writeByteToRegister(Registers.REG_BAL_TIME, regValue);
   }

   toString() {
      return `TeslaModule #${this.id}`;
   }
}

class BQIOControl {
   private byteValue: number;
   constructor(byteValue: number) {
      this.byteValue = byteValue;
   }
   toString(): string {
      let result = 'IO Control: Aux: ';
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
      if (this.byteValue & (1 << 0)) result += ' Connected';
      if (this.byteValue === 0) result += ' Not connected';

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
      const result = other.byteValue === this.byteValue;

      return result;
   }

   toString(): string {
      let result = 'Alerts: ';
      if (this.byteValue & (1 << 7)) result += ` Address has not been assigned`;
      if (this.byteValue & (1 << 6)) result += ' Group 3 protected registers are invalid';
      if (this.byteValue & (1 << 5)) result += ' Uncorrectable EPROM error';
      if (this.byteValue & (1 << 4)) result += ' Alert asserted';
      if (this.byteValue & (1 << 3)) result += ' Thermal shutdown';
      if (this.byteValue & (1 << 2)) result += ' Sleep mode was activated';
      if (this.byteValue & (1 << 1)) result += ' Overtemperature on TS2';
      if (this.byteValue & (1 << 0)) result += ' Overtemperature on TS1';
      if (this.byteValue === 0) result += ' None';

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
      const result = other.byteValue === this.byteValue;

      return result;
   }

   toString(): string {
      let result = 'Faults: ';
      if (this.byteValue & (1 << 5)) result += ' Internal Consistency Check Failed';
      if (this.byteValue & (1 << 4)) result += ' Fault Forced';
      if (this.byteValue & (1 << 3)) result += ' Power-on-reset occurred';
      if (this.byteValue & (1 << 2)) result += ' CRC error detected in last packet';
      if (this.byteValue & (1 << 1)) result += ' Undervoltage';
      if (this.byteValue & (1 << 0)) result += ' Overvoltage';
      if (this.byteValue === 0) result += ' None';

      return result;
   }
}

export { TeslaModule, BQAlerts, BQFaults };
