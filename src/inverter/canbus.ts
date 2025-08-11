import { SerialPort } from 'serialport';
import type { ChargeInfo } from './commands/get-charge-discharge-info';
import { inverterLogger as logger } from "../logger";
import { sendAllPackets } from './can-packet';
import { BatteryI } from '../battery/battery';
import { autoReconnect } from '../comms/serial-auto-reconnect';
import { Downtime } from '../history/downtime';
import { PacketStats } from '../comms/packet-stats';

// The start of a message sent by the inverter to the bms in reply.
const INVERTER_COMMS_FRAGMENT = /t30[75]80000000000000000/;

export interface CanbusSerialPortI {
   open(): Promise<void>;
   close(): void;
   sendBatteryInfoToInverter(chargeData: ChargeInfo): void;
   readonly downtime: Downtime;
   readonly packetStats: PacketStats;
}

export class CanbusSerialPort implements CanbusSerialPortI {
   private port!: SerialPort;
   private device: string;
   private humanName: string;
   private speed: number;
   private battery: BatteryI;
   public readonly downtime: Downtime;
   public readonly packetStats: PacketStats;

   constructor(device: string, speed: number, humanName: string, battery: BatteryI) {
      this.humanName = humanName;
      this.device = device;
      this.speed = speed;
      this.battery = battery;
      // canbus replies come immediately after a send and we send every second
      this.downtime = new Downtime(2_000);
      this.packetStats = new PacketStats();
   }

   async open(): Promise<void> {
      return new Promise((resolve, _reject) => {
         logger.info(`Opening serial port ${this.humanName}:${this.device} at ${this.speed} baud`);
         this.port = new SerialPort({
            path: this.device,
            baudRate: this.speed,
         });

         autoReconnect(this.port, {
            humanName: this.humanName,
            delayMs: 1000,
         });

         this.port.on('data', (data: Buffer) => {
            logger.silly('Received %d canbus bytes: %s', data.length, data.toString());
            if (data.toString().match(INVERTER_COMMS_FRAGMENT)) {
               this.downtime.up();
               this.packetStats.incrementTotal();
            }
         });

         this.port.on('open', () => {
            logger.info(`Serial port ${this.humanName}:${this.device} opened successfully`);
            this.openCanChannel();
            resolve();
         });
      });
   }

   private openCanChannel() {
      // O opens the channel, S6 sets the baud rate to 500kbps
      this.port.write("C\rS6\rO\r");
   }

   close(): void {
      logger.debug(`Closing serial port ${this.device}`);
      this.port.close();
   }

   sendBatteryInfoToInverter(chargeData: ChargeInfo) {
      if (!this.port.isOpen) {
         logger.debug("Cannot canbus send data to inverter, serial port is not open");
         return;
      }
      logger.info("Sending packets to inverter via canbus");
      sendAllPackets(this.port, chargeData, this.battery);
   }
}
