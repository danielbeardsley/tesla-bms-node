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
   readonly ready: Promise<void>;
   getAllData(): Record<string, number>;
}

type ShuntData = {
   all: Record<string, number>;
   SOC?: number; // state of charge, 0..1
   I?: number;   // current, A
};
// SOC doesn't change quickly, so we can tolerate older data
// consider SoC valid if updated within this many seconds
const SHUNT_SOC_VALID_S = 300;

export class VictronSmartShunt implements Shunt {
   private serialPort: SerialPort;
   private lastUpdate: number = 0;
   private data: ShuntData = {all: {}, SOC: undefined, I: undefined};
   private parser: VEDirectParser;
   private onDataUpdate: () => void;
   public readonly packetStats = new PacketStats();
   public readonly downtime: Downtime;
   public readonly ready: Promise<void>;

   constructor(serialPort: SerialPort, downtime: Downtime, onDataUpdate: () => void = () => {}) {
      this.serialPort = serialPort;
      autoReconnect(serialPort, { delayMs: 1000, humanName: 'Victron SmartShunt' });
      const delimiter = new DelimiterParser({
        delimiter: Buffer.from("0d0a", 'hex'),
        includeDelimiter: false
      });
      this.parser = new VEDirectParser();

      serialPort.pipe(delimiter).pipe(this.parser);

      this.parser.on("data", this.ingestData.bind(this));
      this.downtime = downtime;

      let ready: () => void;
      this.ready = new Promise((resolve) => {
        ready = resolve;
      });
      this.onDataUpdate = () =>{
         ready();
         onDataUpdate();
      }
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
            this.data.all = data;
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
      return this.updatedWithin(SHUNT_SOC_VALID_S) ? this.data.SOC : undefined;
   }

   getCurrent(): number | undefined {
      return this.updatedWithin(this.downtime.timeoutMs * 1000) ? this.data.I : undefined;
   }

   getAllData(): Record<string, number> {
      return this.data.all;
   }

   private updatedWithin(seconds: number): boolean {
      return (Date.now() - this.lastUpdate) < (seconds * 1000);
   }

   close() {
      this.serialPort.close();
   }
}
