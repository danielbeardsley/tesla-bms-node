import { SerialPortMock, type SerialPort } from 'serialport';
import { describe, it, expect } from 'vitest';
import { VictronSmartShunt } from './shunt';

describe('Shunt', () => {
   it('should parse fields from the protocol with a good checksum', async () => {
      const port = await getOpenedPort();
      const {shunt, dataPromise} = getShunt(port);
      port.port?.emitData(Buffer.from("\r\nI\t13000"));
      port.port?.emitData(Buffer.from("\r\nSOC\t58500"));
      port.port?.emitData(Buffer.from("\r\nChecksum\t\x49", 'binary'));
      port.port?.emitData(Buffer.from("\r\nAnotherField"));
      await dataPromise;
      expect(shunt.getCurrent()).toBe(13);
      expect(shunt.getSOC()).toBe(58.5);
   });

   it('should not store the values from a packet with a bad checksum', async () => {
      const port = await getOpenedPort();
      const {shunt, dataPromise} = getShunt(port);
      const BAD_CHECKSUM = 0;
      port.port?.emitData(Buffer.from("\r\nI\t13000"));
      port.port?.emitData(Buffer.from("\r\nSOC\t58500"));
      port.port?.emitData(Buffer.from("\r\nChecksum\t" + BAD_CHECKSUM, 'binary'));
      port.port?.emitData(Buffer.from("\r\nAnotherField"));
      await dataPromise;
      expect(shunt.getCurrent()).toBe(undefined);
      expect(shunt.getSOC()).toBe(undefined);
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
   let onDataResolve: () => void;
   const onDataPromise = new Promise<void>((resolve) => {
      onDataResolve = resolve;
   });
   return {
      shunt: new VictronSmartShunt(port as unknown as SerialPort, () => {
         onDataResolve();
      }),
      dataPromise: onDataPromise
   };
}
