import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from './server';
import { Config, getConfig, _resetCachedConfig } from '../config';
import * as fs from 'fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

vi.mock('fs', async () => {
   const actual = await vi.importActual<typeof fs>('fs');
   return { ...actual, writeFileSync: vi.fn() };
});

let server: Server;

function listen() {
   const app = createApp();
   server = app.listen(0);
   const { port } = server.address() as AddressInfo;
   return port;
}

describe('Config API', () => {
   beforeEach(() => {
      _resetCachedConfig();
      vi.mocked(fs.writeFileSync).mockClear();
   });

   afterEach(() => {
      server?.close();
   });

   it('GET /config returns the full config', async () => {
      const port = listen();

      const res = await fetch(`http://127.0.0.1:${port}/config`);
      expect(res.status).toBe(200);
      const body = await res.json() as Config;
      const config = getConfig();
      expect(body.battery.charging.maxAmps).toBe(config.battery.charging.maxAmps);
      expect(body.bms.intervalS).toBe(config.bms.intervalS);
   });

   it('PATCH /config updates a single field', async () => {
      const port = listen();
      const originalAmps = getConfig().battery.charging.maxAmps;
      const newAmps = originalAmps + 10;

      const res = await fetch(`http://127.0.0.1:${port}/config`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ battery: { charging: { maxAmps: newAmps } } }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as Config;
      expect(body.battery.charging.maxAmps).toBe(newAmps);
      expect(getConfig().battery.charging.maxAmps).toBe(newAmps);
      expect(fs.writeFileSync).toHaveBeenCalledOnce();
   });

   it('PATCH /config returns 400 for invalid values', async () => {
      const port = listen();

      const res = await fetch(`http://127.0.0.1:${port}/config`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ battery: { moduleCount: -5 } }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error: unknown };
      expect(body.error).toBeDefined();
      expect(Array.isArray(body.error)).toBe(true);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
   });

   it('PATCH /config preserves other fields when updating one', async () => {
      const port = listen();
      const originalMinVolts = getConfig().battery.discharging.minVolts;

      const res = await fetch(`http://127.0.0.1:${port}/config`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ battery: { charging: { maxAmps: 999 } } }),
      });

      expect(res.status).toBe(200);
      expect(getConfig().battery.discharging.minVolts).toBe(originalMinVolts);
   });
});
