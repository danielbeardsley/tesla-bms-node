import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { diffConfigs, logConfigChanges, getChangelog } from './config-changelog';
import { createApp } from './server';
import { _resetCachedConfig } from '../config';
import * as fs from 'fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

vi.mock('fs', async () => {
   const actual = await vi.importActual<typeof fs>('fs');
   return {
      ...actual,
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(),
   };
});

describe('diffConfigs', () => {
   it('detects a changed leaf value', () => {
      const old = { a: { b: 1 } };
      const now = { a: { b: 2 } };
      const changes = diffConfigs(old, now);
      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('a.b');
      expect(changes[0].oldValue).toBe(1);
      expect(changes[0].newValue).toBe(2);
   });

   it('ignores unchanged values', () => {
      const obj = { x: 1, y: { z: "hello" } };
      const changes = diffConfigs(obj, { ...obj });
      expect(changes).toHaveLength(0);
   });

   it('detects multiple changes across nested objects', () => {
      const old = { a: 1, b: { c: 2, d: 3 } };
      const now = { a: 10, b: { c: 2, d: 30 } };
      const changes = diffConfigs(old, now);
      expect(changes).toHaveLength(2);
      expect(changes.map(c => c.path).sort()).toEqual(['a', 'b.d']);
   });

   it('detects changed arrays', () => {
      const old = { arr: [1, 2] };
      const now = { arr: [1, 3] };
      const changes = diffConfigs(old, now);
      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('arr');
   });
});

describe('logConfigChanges / getChangelog', () => {
   beforeEach(() => {
      vi.mocked(fs.writeFileSync).mockClear();
      vi.mocked(fs.readFileSync).mockClear();
   });

   it('appends entries and writes to disk', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('[]');
      logConfigChanges([
         { timestamp: '2026-01-01T00:00:00Z', path: 'a.b', oldValue: 1, newValue: 2 },
      ]);
      expect(fs.writeFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written).toHaveLength(1);
      expect(written[0].path).toBe('a.b');
   });

   it('caps at 200 entries', () => {
      const existing = Array.from({ length: 199 }, (_, i) => ({
         timestamp: '2026-01-01T00:00:00Z',
         path: `field.${i}`,
         oldValue: i,
         newValue: i + 1,
      }));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      logConfigChanges([
         { timestamp: '2026-01-02T00:00:00Z', path: 'new.a', oldValue: 0, newValue: 1 },
         { timestamp: '2026-01-02T00:00:00Z', path: 'new.b', oldValue: 0, newValue: 1 },
      ]);
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written).toHaveLength(200);
      // Oldest entry should have been trimmed
      expect(written[0].path).toBe('field.1');
      expect(written[199].path).toBe('new.b');
   });

   it('returns empty array when file is missing', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
      expect(getChangelog()).toEqual([]);
   });
});

describe('GET /config/changelog', () => {
   let server: Server;

   afterEach(() => {
      server?.close();
   });

   it('returns the changelog as JSON', async () => {
      _resetCachedConfig();
      const entries = [
         { timestamp: '2026-01-01T00:00:00Z', path: 'a.b', oldValue: 1, newValue: 2 },
      ];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entries));

      const app = createApp();
      server = app.listen(0);
      const { port } = server.address() as AddressInfo;

      const res = await fetch(`http://127.0.0.1:${port}/config/changelog`);
      expect(res.status).toBe(200);
      const body = await res.json() as Array<{ path: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].path).toBe('a.b');
   });
});
