import AsyncLock from 'async-lock';
import { SerialWrapper } from './src/serial-wrapper';
import { BMSBoard, BQAlerts, BQFaults } from './src/bms-board';

interface BitFields {
   [key: string]: number;
}

class BitmapField {
   // maps bit to symbolic name
   // { 0: 'jet engine enabled', 1: 'black hole collapsing' }
   private name: string;
   private bits: BitFields;
   private fields: { [key: string]: string };

   constructor(name: string, bits: BitFields) {
      this.name = name;
      this.bits = bits;
      this.fields = {};
      for (const bit in bits) {
         this.fields[this.bits[bit]] = bit;
      }
   }

   setFields(fieldValues: { [key: string]: boolean }, value: number): number {
      for (const field in fieldValues) {
         if (field in this.fields) {
            const bit = this.fields[field];
            const mask = 1 << parseInt(bit);

            value = value & ~mask; // reset bit
            if (fieldValues[field]) value = value | mask;
         } else throw new Error(`Unrecognized field '${field}'`);
      }
      return value;
   }

   getFields(value: number): { [key: string]: boolean } {
      const fields: { [key: string]: boolean } = {};
      for (const field in this.fields) {
         const bit = parseInt(this.fields[field]);
         fields[field] = (value & (1 << bit)) !== 0;
      }
      return fields;
   }
}

class BitmapValue {
   private bitmap: BitmapField;
   private value: number;

   constructor(bitmap: BitmapField) {
      this.bitmap = bitmap;
      this.value = 0;
   }

   setValue(value: number): void {
      this.value = value;
   }

   setFields(fields: { [key: string]: boolean }): void {
      this.value = this.bitmap.setFields(fields, this.value);
   }

   getValue(): number {
      return this.value;
   }

   getFields(): { [key: string]: boolean } {
      return this.bitmap.getFields(this.value);
   }

   toString(): string {
      return 'NIY';
   }
}

var pack = new BMSPack('/dev/ttyUSB0');

initPack(pack)
   .then(() => pack.wakeBoards())
   .then(async () => {
      for (var key in pack.modules) {
         var module = pack.modules[key];
         await module
            .readIOControl()
            .then(ioControl => {})
            .then(() => {
               return module.readStatus();
            })
            .then(() => {
               return module.readValues();
            })
            .then(() => {
               return module.readConfig();
            })
            .then(() => {
               return module.sleep();
            })
            .then(() => {
               // return module.readStatus();
            })
            .then(() => {
               console.log(module.cellVoltages);
               console.log(module.temperatures);
            });
      }
   })
   .then(async () => {
      while (true) {
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

async function initPack(pack: BMSPack) {
   await pack.init();
}

async function sleep(ms: number) {
   return new Promise(resolve => setTimeout(resolve, ms));
}
