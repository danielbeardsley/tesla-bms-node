interface BitFields {
   [key: string]: number;
}

export class BitmapValue {
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