import { SerialPortMock, type SerialPort } from 'serialport';
import { describe, it, expect } from 'vitest';
import { Downtime } from '../history/downtime';
import { VictronSmartShunt } from './shunt';

describe('Shunt', () => {
   it('should parse fields from the protocol with a good checksum', async () => {
      const port = await getOpenedPort();
      const {shunt, waitForData} = getShunt(port);
      emitFrame(port, { I: 13000, SOC: 58500 });
      flushParser(port);
      await waitForData();
      expect(shunt.getCurrent()).toBe(13);
      expect(shunt.getSOC()).toBe(58.5);
   });

   it('should not store the values from a packet with a bad checksum', async () => {
      const port = await getOpenedPort();
      const {shunt, waitForData} = getShunt(port);
      emitFrame(port, { I: 13000, SOC: 58500 }, { badChecksum: true });
      flushParser(port);
      await waitForData();
      expect(shunt.getCurrent()).toBe(undefined);
      expect(shunt.getSOC()).toBe(undefined);
   });

   it('should average current samples and reset on read', async () => {
      const port = await getOpenedPort();
      const {shunt, waitForData} = getShunt(port);
      emitFrame(port, { I: 10000, SOC: 50000 });
      emitFrame(port, { I: 20000, SOC: 50000 });
      emitFrame(port, { I: 30000, SOC: 50000 });
      flushParser(port);
      await waitForData(3);
      expect(shunt.getAverageCurrentAndReset()).toBeCloseTo(20);
      expect(shunt.getAverageCurrentAndReset()).toBe(undefined);
   });

   it('should not include bad-checksum samples in the average', async () => {
      const port = await getOpenedPort();
      const {shunt, waitForData} = getShunt(port);
      emitFrame(port, { I: 10000, SOC: 50000 });
      emitFrame(port, { I: 99000, SOC: 50000 }, { badChecksum: true });
      emitFrame(port, { I: 30000, SOC: 50000 });
      flushParser(port);
      await waitForData(3);
      expect(shunt.getAverageCurrentAndReset()).toBeCloseTo(20);
   });
});

async function getOpenedPort(): Promise<SerialPortMock> {
   const path = '/dev/example' + Math.random();
   SerialPortMock.binding.createPort(path)
   const port = new SerialPortMock({ path, baudRate: 19200 })

   return new Promise((resolve) => {
      port.on('open', () => {
         resolve(port);
      });
   });
}

function getShunt(port: SerialPortMock) {
   let count = 0;
   const waiters: Array<{ target: number; resolve: () => void }> = [];
   const downtime = new Downtime('a', 'b', 1000);
   const shunt = new VictronSmartShunt(port as unknown as SerialPort, downtime, () => {
      count++;
      for (let i = waiters.length - 1; i >= 0; i--) {
         if (count >= waiters[i].target) {
            waiters[i].resolve();
            waiters.splice(i, 1);
         }
      }
   });
   const waitForData = (n: number = 1) => {
      const target = count + n;
      if (count >= target) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push({ target, resolve }));
   };
   return { shunt, waitForData };
}

// VE.Direct frames are blocks of \r\n-delimited "<key>\t<value>" lines, terminated
// by a "Checksum\t<byte>" line where <byte> makes the sum of every byte (including
// delimiters) in the block equal 0 mod 256. The DelimiterParser only emits a chunk
// once the next delimiter arrives, so each frame's Checksum line is held in the
// parser buffer until the next \r\n. For consecutive frames the next frame's first
// line provides that delimiter; after the last frame, call flushParser().
function emitFrame(
   port: SerialPortMock,
   fields: Record<string, number>,
   opts: { badChecksum?: boolean } = {},
) {
   const lines = Object.entries(fields).map(([k, v]) => `\r\n${k}\t${v}`);
   const checksumPrefix = '\r\nChecksum\t';
   const partial = Buffer.from(lines.join('') + checksumPrefix, 'binary');
   const partialSum = partial.reduce((a, b) => (a + b) & 255, 0);
   const goodByte = (256 - partialSum) & 255;
   const checksumByte = opts.badChecksum ? (goodByte + 1) & 255 : goodByte;
   for (const line of lines) port.port?.emitData(Buffer.from(line, 'binary'));
   port.port?.emitData(Buffer.from(checksumPrefix + String.fromCharCode(checksumByte), 'binary'));
}

function flushParser(port: SerialPortMock) {
   port.port?.emitData(Buffer.from('\r\nFlush', 'binary'));
}
