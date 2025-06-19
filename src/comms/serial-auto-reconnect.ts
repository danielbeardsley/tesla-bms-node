import { SerialPort } from 'serialport';
import { logger } from '../logger';
import { sleep } from '../utils';

const maxDelayms = 60 * 1000;

type ReconnectionOptions = {
   delayMs: number;
   humanName: string;
};

export function autoReconnect(port: SerialPort, opts: ReconnectionOptions) {
   let closedAt = 0;
   let opened = false;
   logger.info(`${opts.humanName} setting up auto-reconnect`);

   port.on('open', () => {
      reconnecting = false;
      if (closedAt) {
         const ms = Date.now() - closedAt;
         logger.info(`${opts.humanName} serial port reconnected after ${(ms/1000).toFixed()}s`);
      } else {
         logger.info(`${opts.humanName} serial port connected`);
      }
      opened = true;
      closedAt = 0;
   });

   port.on('error', err => {
      logger.error(`${opts.humanName} serial port error`, err);
      // If we've never opened the port, there won't be a "close" event (only
      // an "error") and thus we have to reconnect here.
      if (!opened) {
         reconnect();
      }
   });

   port.on('close', (err: {disconnected?: boolean} | null) => {
      // "disconnected" will be set if the port was closed unexpectedly,
      // vs the code calling .close()
      const unexpected = err?.disconnected;
      if (unexpected) {
         logger.error(`${opts.humanName} serial port closed unexpectedly`);
         reconnect();
      } else {
         logger.info(`${opts.humanName} intentionally closing serial port`);
      }
      closedAt = Date.now();
   });

   let reconnecting = false;
   async function reconnect(): Promise<void> {
      if (reconnecting || port.isOpen) {
         return;
      }
      reconnecting = true;
      let delay = opts.delayMs;
      while (!port.isOpen) {
         port.open();
         await sleep(delay);
         // slowly try less and less often
         delay = Math.min(delay * 1.2, maxDelayms);
      }
      reconnecting = false;
   }
}
