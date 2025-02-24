export class BitmapField {
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