import { SerialPort } from 'serialport';
import { Buffer } from 'buffer';
import { logger } from '../logger';
import { autoReconnect } from './serial-auto-reconnect';

export class SerialWrapper {
   private port!: SerialPort;
   private buffer: number[];
   private readQueue: ((cancelled?: boolean) => boolean)[];
   private device: string;
   private speed: number;

   constructor(device: string, speed: number) {
      this.device = device;
      this.speed = speed;
      this.buffer = [];
      this.readQueue = [];
   }

   async open(): Promise<SerialWrapper> {
      return new Promise((resolve, _reject) => {
         logger.info(`Opening serial port ${this.device} at ${this.speed} baud`);
         this.port = new SerialPort({
            path: this.device,
            baudRate: this.speed,
         });

         autoReconnect(this.port, {
            humanName: this.device,
            delayMs: 1000,
         });

         this.port.on('data', (data: Buffer) => {
            logger.silly('Received %d bytes', data.length);
            this.buffer.push(...data);
            this.processReadQueue();
         });

         this.port.on('open', () => resolve(this));
         this.port.on('close', () => {
            this.cancelReadQueue();
         });
      });
   }

   close(): void {
      logger.debug(`Closing serial port ${this.device}`);
      this.port.close();
   }

   async write(buffer: number[] | Buffer): Promise<void> {
      return new Promise((resolve, reject) => {
         this.port.write(buffer, (err?: Error | null) => {
            if (err) reject(err);
            else {
               this.port.drain((error?: Error | null) => {
                  if (error) reject(error);
                  else resolve();
               });
            }
         });
      });
   }

   /**
    * Let the first function in the queue know that there is data to read.
    */
   private processReadQueue(): void {
      while (this.readQueue.length && this.buffer.length) {
         // If the reader is unhappy with the data, we will wait
         if (!this.readQueue[0]()) {
            return;
         }
         // Otherwise, we will remove the reader from the queue cause they
         // were satisfied with the data.
         this.readQueue.shift();
      }
   }

   private cancelReadQueue(): void {
      this.readQueue.forEach(reader => reader(true));
      this.readQueue = [];
   }

   async readTillDelimiter(delimiter: number, timeout: number = 100): Promise<number[]> {
      return new Promise((resolve, reject) => {
         const timeoutid: NodeJS.Timeout | null =
            timeout > 0
               ? setTimeout(() => {
                    reject(new Error(`Timeout waiting for 0x${delimiter.toString(16)} bytes`));
                    this.readQueue.shift();
                 }, timeout)
               : null;

         this.readQueue.push((cancelled?: boolean) => {
            if (cancelled) {
               reject(new Error('Port closed'));
               return false;
            }
            const delimiterIndex = this.buffer.indexOf(delimiter);
            if (delimiterIndex === -1) {
               return false;
            }
            if (timeoutid) {
               clearTimeout(timeoutid);
            }
            const buffer = this.buffer.slice(0, delimiterIndex + 1);
            this.buffer = this.buffer.slice(delimiterIndex + 1);
            resolve(buffer);
            return true;
         });
      });
   }

   /**
    * Return a promise that will resolve when the requested number of bytes
    * have been read. If the timeout is reached, the promise will reject.
    */
   async readBytes(numBytes: number, timeout: number = 100): Promise<number[]> {
      return new Promise((resolve, reject) => {
         const timeoutid: NodeJS.Timeout | null =
            timeout > 0
               ? setTimeout(() => {
                    reject(new Error(`Timeout waiting for ${numBytes} bytes`));
                    this.readQueue.shift();
                 }, timeout)
               : null;

         this.readQueue.push(() => {
            if (this.buffer.length < numBytes) {
               return false;
            }
            if (timeoutid) {
               clearTimeout(timeoutid);
            }
            const buffer = this.buffer.slice(0, numBytes);
            this.buffer = this.buffer.slice(numBytes);
            resolve(buffer);
            return true;
         });
         this.processReadQueue();
      });
   }

   flushInput(): void {
      this.buffer = [];
   }
}
