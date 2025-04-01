type HistoryColumns = {
   batteryVolts: number[];
   batteryCellVoltsMin: number[];
   batteryCellVoltsMax: number[];
   batteryTempMin: number[];
   batteryTempMax: number[];
}

type HistoryRecord = Record<keyof HistoryColumns, number>;

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
         batteryCellVoltsMin: empty(),
         batteryCellVoltsMax: empty(),
         batteryTempMin: empty(),
         batteryTempMax: empty(),
      };
      this.index = 0;
   }

   public add(timestamp: number, values: HistoryRecord) {
      const round = (x: number) => Number(x.toFixed(3));
      this.samplesCollected++;
      this.timestamps[this.index] = timestamp;
      this.values.batteryVolts[this.index] = round(values.batteryVolts);
      this.values.batteryCellVoltsMin[this.index] = round(values.batteryCellVoltsMin);
      this.values.batteryCellVoltsMax[this.index] = round(values.batteryCellVoltsMax);
      this.values.batteryTempMin[this.index] = round(values.batteryTempMin);
      this.values.batteryTempMax[this.index] = round(values.batteryTempMax);
      this.index = (this.index + 1) % this.samplesToKeep;
   }

   public getValues() {
      const values = {
         timestamps: this.linearize(this.timestamps),
         batteryVolts: this.linearize(this.values.batteryVolts),
         batteryCellVoltsMin: this.linearize(this.values.batteryCellVoltsMin),
         batteryCellVoltsMax: this.linearize(this.values.batteryCellVoltsMax),
         batteryTempMin: this.linearize(this.values.batteryTempMin),
         batteryTempMax: this.linearize(this.values.batteryTempMax),
      };
      return values;
   }

   private linearize(arr: number[]) {
      const leftHalf = arr.slice(0, this.index);
      if (this.samplesCollected < this.samplesToKeep) {
         return leftHalf;
      }
      return arr.slice(this.index).concat(leftHalf);
   }
}