import { SerialPort } from 'serialport';
import { logger } from '../logger';
import { sleep } from '../utils';

const maxDelayms = 60 * 1000;

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
      let delay = opts.delayMs;
      while (!port.isOpen) {
         port.open();
         await sleep(delay);
         // slowly try less and less often
         delay = Math.min(delay * 1.1, maxDelayms);
      }
      closing = false;
   }
}
