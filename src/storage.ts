import { z } from "zod";
import deepEqual from 'fast-deep-equal';
import { logger } from "./logger";
import { promises as fsPromises } from 'node:fs';
import { dirname } from 'node:path';

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

   async load() {
      await validateAccess(this.filename);
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
      this.data = newStorage;
      return writeJsonFile(this.filename, this.data);
   }
}

function writeJsonFile(path: string, obj: object) {
  const json = JSON.stringify(obj, null, 2); // pretty-print
  return fsPromises.writeFile(path, json, "utf8");
}

async function validateAccess(path: string) {
  // Assert we can read and write the path
   const requiredPerms = fsPromises.constants.W_OK | fsPromises.constants.R_OK;
   return fsPromises.access(path, requiredPerms)
      .then(
         () => Promise.resolve(),
         (err) => {
            // If the file doesn't exist, check that we can access the directory
            if (err.code === 'ENOENT') {
               return fsPromises.access(dirname(path), requiredPerms)
            }
            throw err;
         }
      );
}

async function loadJsonFile(path: string) {
  const data = await fsPromises.readFile(path, "utf8");
  return JSON.parse(data);
}
