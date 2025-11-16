import { describe, it, expect, afterEach } from 'vitest';
import { Storage } from './storage';
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function createTempDir() {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, "unit-test-");
  return await fs.mkdtemp(tmpdir);
}

const tmpdir: string[] = [];

afterEach(async () => {
   while (tmpdir.length) {
      await fs.rm(tmpdir.pop() ?? '', { recursive: true });
   }
});

describe("storage", () => {
   it("should save and load the data", async () => {
      const dir = await createTempDir();
      const filename = path.join(dir, "save-load.json");
      const storageSave = new Storage(filename);
      await storageSave.update({lastFullCharge: 1234});

      const storageLoad = new Storage(filename);
      await storageLoad.load();
      expect(storageLoad.get()).toStrictEqual({lastFullCharge: 1234});
   });

   it("should throw when reading a file it can't write", async () => {
      const storageNotWritable = new Storage('/root.json');
      await expect(storageNotWritable.load()).rejects.toBeInstanceOf(Error);
   });

   it("should not throw when reading a file that doesn't exist", async () => {
      const dir = await createTempDir();
      const filename = path.join(dir, "missing.json");
      const storageMissing = new Storage(filename);
      await expect(storageMissing.load()).resolves.toBeUndefined();
   });
});
