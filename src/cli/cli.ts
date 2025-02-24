import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { TeslaComms } from '../tesla-comms';
import { SerialWrapper } from '../serial-wrapper';

yargs(hideBin(process.argv))
  .command('renumber',
    're-index and re-number the modules', () => {},
    async () => {
        const teslaComms = await connect();
        const moduleCount = await teslaComms.renumberModules(64);
        console.log(`Renumbered ${moduleCount} modules`);
        await teslaComms.close();
    })
  .parse();

async function connect() {
  const serial = new SerialWrapper('/dev/ttyUSB0', 612500);
  await serial.open();
  const teslaComms = new TeslaComms(serial);
  return teslaComms;
}
