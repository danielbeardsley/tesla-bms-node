import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter'
import VEDirectParser from '@bencevans/ve.direct/parser';
import { batteryLogger as logger } from '../logger';
import { autoReconnect } from '../comms/serial-auto-reconnect';

export interface Shunt {
   getLastUpdate(): number;
   getSOC(): number | undefined;
   close(): void;
}

export class VictronSmartShunt implements Shunt {
   private serialPort: SerialPort;
   private lastUpdate: number = 0;
   private data: Record<string, number> = {};

   constructor(serialPort: SerialPort) {
      this.serialPort = serialPort;
      autoReconnect(serialPort, { delayMs: 1000, humanName: 'Victron SmartShunt' });
      const delimiter = new DelimiterParser({
        delimiter: Buffer.from("0d0a", 'hex'),
        includeDelimiter: false
      });
      const veDirectParser = new VEDirectParser();

      serialPort.pipe(delimiter).pipe(veDirectParser);

      veDirectParser.on("data", this.ingestData.bind(this));
   }

   private ingestData(data: Record<string, number>) {
      if (data && data.SOC !== undefined) {
         this.data.SOC = data.SOC / 1000;
         this.lastUpdate = Date.now();
      }
   }

   getLastUpdate(): number {
      return this.lastUpdate;
   }

   getSOC(): number | undefined {
      return this.data.SOC;
   }

   close() {
      this.serialPort.close();
   }
}
