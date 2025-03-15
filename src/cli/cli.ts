import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TeslaComms } from '../battery/tesla-comms';
import { SerialWrapper } from '../comms/serial-wrapper';
import { TeslaModule } from '../battery/tesla-module';
import { Battery } from '../battery/battery';
import { sleep } from '../utils';
import { getConfig } from '../config';
import { Pylontech } from 'src/inverter/pylontech';

interface ModuleArgs {
   module: number;
}

yargs(hideBin(process.argv))
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
         battery.close();
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
               console.log("Error Reading packet", e);
            }
         }
      }
   )
   .command<ModuleArgs>(
      'balance <module>',
      'Tell a module to balance itself and stream the voltages as they change',
      yargs => {
         return yargs.positional('module', {
            describe: 'module number',
            type: 'number',
            demandOption: true,
         });
      },
      async argv => {
         const teslaComms = await getTeslaComms();
         try {
            const module = new TeslaModule(teslaComms, argv.module);
            while (true) {
               const result = await module.balanceIfNeeded(0.1, 60);
               const spread = module.getMaxVoltage() - module.getMinVoltage();
               const cells = module.cellVoltages.map(v => v.toFixed(3)).join(', ');
               const totalVolts = module.cellVoltages.reduce((a, b) => a + b, 0);
               const balanceMessage = result.map(b => (b ? 'X' : ' ')).join('|');
               console.log(
                  `Spread: ${(spread * 1000).toFixed(0)}mV, balance: ${balanceMessage}, cells: ${cells}, total: ${totalVolts.toFixed(3)}V, moduleVolts: ${module.moduleVolts?.toFixed(3)}V`
               );
               await sleep(60000);
            }
         } finally {
            await teslaComms.close();
         }
      }
   )
   .parse();

async function getTeslaComms() {
   const config = getConfig();
   const serialConfig = config.battery.serialPort;
   const serial = new SerialWrapper(serialConfig.deviceName, TeslaComms.BAUD);
   await serial.open();
   return new TeslaComms(serial);
}

async function getBattery() {
   const config = getConfig();
   const teslaComms = await getTeslaComms();
   const battery = new Battery(teslaComms, config);
   await battery.init();
   await battery.readAll();
   return battery;
}

async function getInverter() {
   const config = getConfig();
   const inverterConfig = config.inverter.serialPort;
   const serial = new SerialWrapper(
      inverterConfig.deviceName,
      inverterConfig.baudRate);
   return new Pylontech(serial);
}