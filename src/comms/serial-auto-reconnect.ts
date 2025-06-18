import { SerialPort } from 'serialport';
import { logger } from '../logger';
import { sleep } from '../utils';

type ReconnectionOptions = {
   delayMs: number;
   humanName: string;
};

export function autoReconnect(port: SerialPort, opts: ReconnectionOptions) {
   let closing = false;
   const originalClose = port.close.bind(port);

   port.close = () => {
      closing = true;
      originalClose();
   };

   port.on('error', err => {
      logger.error(`${opts.humanName} serial port error`);
      logger.error(err);
   });

   port.on('close', () => {
      if (!closing) {
         logger.error(`${opts.humanName} serial port closed unexpectedly`);
         reconnect();
      }
      closing = false;
   });

   async function reconnect(): Promise<void> {
      while (!port.isOpen) {
         port.open();
         await sleep(opts.delayMs);
      }
      closing = false;
   }
}
