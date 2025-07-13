import { BatteryI } from "../battery/battery";
import { BatteryModuleI } from "../battery/tesla-module";
import { Downtime } from "../history/downtime";

export class FakeModule implements BatteryModuleI {
   public cellVoltages: number[];
   public temperatures: number[];
   public moduleVolts: number;
   public lastUpdate: number;

   public voltage: number = 0;
   public capacity: number = 0;

   async sleep() {}
   async readStatus() {}
   async readValues() {}
   async balance(_cells: boolean[]) {}
   async balanceCellsAbove(_balanceAboveV: number, _balanceTimeSec: number): Promise<number> {
      return 0;
   }
   getCellVoltageSum() { return this.cellVoltages.reduce((acc, v) => acc + v, 0) }
   getMinVoltage() { return 0 }
   getMaxVoltage() { return 0 }

   constructor(volts: number[], temps: number[], moduleV: number) {
      this.cellVoltages = volts;
      this.temperatures = temps;
      this.moduleVolts = moduleV;
   }
}

export class FakeBattery implements BatteryI {
   public modules: { [key: number]: FakeModule } = {};
   public voltage: number = 0;
   public capacity: number = 0;
   public current: number = 0;
   public remainingCapacity: number = 0;
   public voltageRange: { min: number, max: number, spread: number } = { min: 0, max: 0, spread: 0 };
   public temperatureRange: { min: number, max: number, spread: number } = { min: 0, max: 0, spread: 0 };
   public balanceForSeconds: number = 0;
   public stateOfCharge: number = 0;
   public temperatureIsSafe: boolean = true;
   public lastUpdateDate: number = 0;
   public readonly downtime: Downtime = new Downtime(1000);
   public readonly shunt = getFakeShunt();

   constructor() {
      // const c = cellVolt * (Math.random()
      this.modules = {
         1: new FakeModule(
            [3.7, 3.7, 3.7, 3.7, 3.7, 3.7],
            [21, 21, 21, 21, 21, 21, 21],
            24,
         ),
         2: new FakeModule(
            [3.7, 3.7, 3.7, 3.7, 3.7, 3.7],
            [21, 21, 21, 21, 21, 21, 21],
            24,
         ),
      };
   }

   getVoltage() {
      return this.voltage;
   }

   getCapacityAh() {
      return this.capacity;
   }

   getRemainingAh() {
      return this.remainingCapacity;
   }

   getCurrent() {
      return this.current;
   }

   getCellVoltageRange() {
      return this.voltageRange;
   }

   getTemperatureRange() {
      return this.temperatureRange;
   }

   getStateOfCharge(): number {
      return this.stateOfCharge;
   }

   getStateOfHealth(): number {
      return 1;
   }

   getLastUpdateDate(): number {
      return this.lastUpdateDate;
   }

   isTemperatureSafe(): boolean {
      return this.temperatureIsSafe;
   }

   async balance(forSeconds: number): Promise<number> {
      this.balanceForSeconds = forSeconds;
      return 0;
   }

   async stopBalancing() {
   }

   async readAll() {
   }
}

export function getFakeShunt() {
    return {
       getSOC: () => 0.5,
       getLastUpdate: () => 0,
       close: () => {},
       getCurrent: () => 10,
       downtime: new Downtime(1000),
    };
}

