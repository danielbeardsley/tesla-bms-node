import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter'
import VEDirectParser from './shunt-comms';
import { batteryLogger as logger } from '../logger';
import { autoReconnect } from '../comms/serial-auto-reconnect';
import { Downtime } from '../history/downtime';
import { PacketStats } from '../comms/packet-stats';

export interface Shunt {
   getLastUpdate(): number;
   getSOC(): number | undefined;
   getCurrent(): number | undefined;
   close(): void;
   readonly downtime: Downtime;
   readonly packetStats: PacketStats;
}

const SHUNT_INTERVAL_S = 1; // expected update interval in seconds

export class VictronSmartShunt implements Shunt {
   private serialPort: SerialPort;
   private lastUpdate: number = 0;
   private data: Record<string, number> = {};
   private parser: VEDirectParser;
   private onDataUpdate: () => void;
   public readonly packetStats = new PacketStats();
   public readonly downtime: Downtime;

   constructor(serialPort: SerialPort, onDataUpdate: () => void = () => {}) {
      this.serialPort = serialPort;
      autoReconnect(serialPort, { delayMs: 1000, humanName: 'Victron SmartShunt' });
      const delimiter = new DelimiterParser({
        delimiter: Buffer.from("0d0a", 'hex'),
        includeDelimiter: false
      });
      this.parser = new VEDirectParser();

      serialPort.pipe(delimiter).pipe(this.parser);

      this.parser.on("data", this.ingestData.bind(this));
      // Consider it downtime if we don't receive data for 2 intervals
      this.downtime = new Downtime(SHUNT_INTERVAL_S * 1000 * 2);
      this.onDataUpdate = onDataUpdate;
   }

   private ingestData(data: Record<string, number>) {
      logger.silly("Shunt data received (valid: %s): %j",
         data.ChecksumValid ? "yes" : "no",
         data
      );

      this.packetStats.incrementTotal();

      if (data.ChecksumValid) {
         this.downtime.up();
         if (data.SOC !== undefined) {
            this.data.SOC = data.SOC / 1000;
            this.data.I = data.I / 1000;
            this.lastUpdate = Date.now();
         }
      } else {
         this.packetStats.incrementBad();
      }
      this.onDataUpdate();
   }

   getLastUpdate(): number {
      return this.lastUpdate;
   }

   getSOC(): number | undefined {
      return this.data.SOC;
   }

   getCurrent(): number | undefined {
      return this.data.I;
   }

   close() {
      this.serialPort.close();
   }
}
