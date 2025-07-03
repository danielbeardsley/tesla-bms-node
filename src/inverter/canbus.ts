import { SerialPort } from 'serialport';
import type { ChargeInfo } from './commands/get-charge-discharge-info';
import { inverterLogger as logger } from "../logger";
import { sendAllPackets } from './can-packet';
import { BatteryI } from '../battery/battery';
import { autoReconnect } from '../comms/serial-auto-reconnect';

export interface CanbusSerialPortI {
   open(): Promise<void>;
   close(): void;
   sendBatteryInfoToInverter(chargeData: ChargeInfo): void;
}

export class CanbusSerialPort implements CanbusSerialPortI {
   private port!: SerialPort;
   private device: string;
   private humanName: string;
   private speed: number;
   private battery: BatteryI;

   constructor(device: string, speed: number, humanName: string, battery: BatteryI) {
      this.humanName = humanName;
      this.device = device;
      this.speed = speed;
      this.battery = battery;
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
            logger.silly('Received %d canbus bytes: %s', data.length, data.toString('hex'));
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
      this.port.write("O\rS6\r");
   }

   close(): void {
      logger.debug(`Closing serial port ${this.device}`);
      this.port.close();
   }

   sendBatteryInfoToInverter(chargeData: ChargeInfo) {
      if (!this.port.isOpen) {
         logger.verbose("Cannot canbus send data to inverter, serial port is not open");
         return;
      }
      logger.info("Sending packets to inverter via canbus");
      sendAllPackets(this.port, chargeData, this.battery);
   }
}
