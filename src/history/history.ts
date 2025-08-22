export type HistoryColumns = {
   batteryVolts: number[];
   batteryAmps: number[];
   batteryWatts: number[];
   batteryCellVoltsMin: number[];
   batteryCellVoltsMax: number[];
   batteryTempMin: number[];
   batteryTempMax: number[];
   tesla: {
      total: number[];
      bad: number[];
   };
   rs485: {
      total: number[];
      bad: number[];
   };
   shunt: {
      total: number[];
      bad: number[];
   };
   canbus: {
      total: number[];
      bad: number[];
   };
}

type HistoryRecord = {
   batteryVolts: number;
   batteryAmps: number;
   batteryWatts: number;
   batteryCellVoltsMin: number;
   batteryCellVoltsMax: number;
   batteryTempMin: number;
   batteryTempMax: number;
   tesla: {
      total: number;
      bad: number;
   };
   rs485: {
      total: number;
      bad: number;
   };
   shunt: {
      total: number;
      bad: number;
   };
   canbus: {
      total: number;
      bad: number;
   };
}

export class History {
   public timestamps: number[];
   public values: HistoryColumns;
   private samplesCollected: number = 0;
   private index: number;
   private samplesToKeep: number;

   constructor(samplesToKeep: number) {
      const empty = () => new Array(samplesToKeep).fill(0);
      this.samplesToKeep = samplesToKeep;
      this.timestamps = empty();
      this.values = {
         batteryVolts: empty(),
         batteryAmps: empty(),
         batteryWatts: empty(),
         batteryCellVoltsMin: empty(),
         batteryCellVoltsMax: empty(),
         batteryTempMin: empty(),
         batteryTempMax: empty(),
         tesla: {
            total: empty(),
            bad: empty(),
         },
         rs485: {
            total: empty(),
            bad: empty(),
         },
         shunt: {
            total: empty(),
            bad: empty(),
         },
         canbus: {
            total: empty(),
            bad: empty(),
         },
      };
      this.index = 0;
   }

   public add(timestamp: number, values: HistoryRecord) {
      const round = (x: number) => Number(x.toFixed(3));
      this.samplesCollected++;
      this.timestamps[this.index] = timestamp;
      this.values.batteryVolts[this.index] = round(values.batteryVolts);
      this.values.batteryAmps[this.index] = round(values.batteryAmps);
      this.values.batteryWatts[this.index] = round(values.batteryWatts);
      this.values.batteryCellVoltsMin[this.index] = round(values.batteryCellVoltsMin);
      this.values.batteryCellVoltsMax[this.index] = round(values.batteryCellVoltsMax);
      this.values.batteryTempMin[this.index] = round(values.batteryTempMin);
      this.values.batteryTempMax[this.index] = round(values.batteryTempMax);
      this.values.tesla.total[this.index] = values.tesla.total;
      this.values.tesla.bad[this.index] = values.tesla.bad;
      this.values.rs485.total[this.index] = values.rs485.total;
      this.values.rs485.bad[this.index] = values.rs485.bad;
      this.values.shunt.total[this.index] = values.shunt.total;
      this.values.shunt.bad[this.index] = values.shunt.bad;
      this.values.canbus.total[this.index] = values.canbus.total;
      this.values.canbus.bad[this.index] = values.canbus.bad;
      this.index = (this.index + 1) % this.samplesToKeep;
   }

   public getValues(count?: number) {
      const values = {
         timestamps: this.linearize(this.timestamps, count),
         batteryVolts: this.linearize(this.values.batteryVolts, count),
         batteryAmps: this.linearize(this.values.batteryAmps, count),
         batteryWatts: this.linearize(this.values.batteryWatts, count),
         batteryCellVoltsMin: this.linearize(this.values.batteryCellVoltsMin, count),
         batteryCellVoltsMax: this.linearize(this.values.batteryCellVoltsMax, count),
         batteryTempMin: this.linearize(this.values.batteryTempMin, count),
         batteryTempMax: this.linearize(this.values.batteryTempMax, count),
         tesla: {
            total: this.linearize(this.values.tesla.total, count),
            bad: this.linearize(this.values.tesla.bad, count),
         },
         rs485: {
            total: this.linearize(this.values.rs485.total, count),
            bad: this.linearize(this.values.rs485.bad, count),
         },
         shunt: {
            total: this.linearize(this.values.shunt.total, count),
            bad: this.linearize(this.values.shunt.bad, count),
         },
         canbus: {
            total: this.linearize(this.values.canbus.total, count),
            bad: this.linearize(this.values.canbus.bad, count),
         },
      };
      return values;
   }

   private linearize(arr: number[], count?: number) {
      const beforeIndexStart = count ? Math.max(0, this.index - count) : 0;
      const leftHalf = arr.slice(beforeIndexStart, this.index);
      if (this.samplesCollected < this.samplesToKeep) {
         return leftHalf;
      }
      const afterIndexStart = count ? this.index + this.samplesToKeep - count : this.index;
      return arr.slice(Math.max(0, afterIndexStart)).concat(leftHalf);
   }
}
