import { z } from "zod";
import { loadJsonFile } from "load-json-file";
import { writeJsonFile } from "write-json-file";
import deepEqual from 'fast-deep-equal';
import { logger } from "./logger";

const StorageSchema = z.object({
   lastFullCharge: z.optional(z.number()),
});

export type StorageValues = z.infer<typeof StorageSchema>;

export type StorageInterface = {
   get(): StorageValues;
   update(newValues: Partial<StorageValues>): Promise<void>;
}

export class Storage implements StorageInterface {
   private data: StorageValues;
   private filename: string = './storage.json';

   constructor(storageFilename: string) {
      this.loadDefaults();
      this.filename = storageFilename;
   }

   load() {
      return loadJsonFile(this.filename)
      .then((json) => {
         this.data = StorageSchema.parse(json);
         if (!this.data) {
            const backupName = `${this.filename}.invalid.${Date.now()}`;
            void writeJsonFile(backupName, json);
            logger.warn("Storage file %s doesn't match the schema, backing up to %s and using defaults", this.filename, backupName);
            this.loadDefaults();
         }
      }).catch(() => {
         logger.warn("Storage file %s not found or invalid, using defaults", this.filename);
      });
   }

   loadDefaults() {
      this.data = {
         lastFullCharge: undefined,
      };
   }

   get() {
      return this.data;
   }

   update(newValues: Partial<StorageValues>) {
      const newStorage = {...this.data, ...newValues};
      if (deepEqual(newStorage, this.data)) {
         return Promise.resolve();
      }
      return writeJsonFile(this.filename, this.data);
   }
}
