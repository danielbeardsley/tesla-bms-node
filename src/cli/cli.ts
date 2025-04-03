import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TeslaComms } from '../battery/tesla-comms';
import { SerialWrapper } from '../comms/serial-wrapper';
import { Battery } from '../battery/battery';
import { getConfig } from '../config';
import { Pylontech } from '../inverter/pylontech';
import { discoverModules } from '../battery/tesla-module-factory';

const result = yargs(hideBin(process.argv))
   .command(
      'renumber',
      're-index and re-number the modules',
      () => {},
      async () => {
         const teslaComms = await getTeslaComms();
         const moduleCount = await teslaComms.renumberModules(64);
         console.log(`Renumbered ${moduleCount} modules`);
         await teslaComms.close();
      }
   )
   .command(
      'cell-voltages',
      'return the cell voltage range for the whole battery',
      () => {},
      async () => {
         const battery = await getBattery();
         const range = battery.getCellVoltageRange();
         console.log(`Cell voltage spread:${(range.spread*1000).toFixed(0)}mV range: ${range.min.toFixed(3)}V - ${range.max.toFixed(3)}V`);
      }
   )
   .command(
      'log-inverter-requests',
      'log all requests from the inverter',
      () => {},
      async () => {
         const inverter = await getInverter();
         while (true) {
            try {
               const packet = await inverter.readPacket();
               console.log("Received Packet:", packet);
            } catch (e) {
               console.error("Error Reading packet", e);
            }
         }
      }
   )
   .parse() as unknown as Promise<void>;

// Hold the node process open.
const timeoutid = setInterval(() => {}, 5000);
// Close the timer when the commands are done.
result.finally(() => {
   clearInterval(timeoutid);
});

let teslaComms: TeslaComms | undefined;
async function getTeslaComms() {
   if (teslaComms) {
      return teslaComms;
   }
   const config = getConfig();
   const serialConfig = config.battery.serialPort;
   const serial = new SerialWrapper(serialConfig.deviceName, TeslaComms.BAUD);
   await serial.open();
   return teslaComms = new TeslaComms(serial);
}

async function getBattery() {
   const config = getConfig();
   const teslaComms = await getTeslaComms();
   const modules = await discoverModules(teslaComms, config, true);
   const battery = new Battery(modules, config);
   await battery.readAll();
   return battery;
}

async function getInverter() {
   const config = getConfig();
   const inverterConfig = config.inverter.serialPort;
   const serial = new SerialWrapper(
      inverterConfig.deviceName,
      inverterConfig.baudRate);
   serial.open();
   return new Pylontech(serial);
}
