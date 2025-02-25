import yargs, {Argv} from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TeslaComms } from '../tesla-comms';
import { SerialWrapper } from '../serial-wrapper';
import { TeslaModule } from '../tesla-module';
import { sleep } from '../utils';

yargs(hideBin(process.argv))
  .command('renumber',
    're-index and re-number the modules', () => {},
    async () => {
        const teslaComms = await connect();
        const moduleCount = await teslaComms.renumberModules(64);
        console.log(`Renumbered ${moduleCount} modules`);
        await teslaComms.close();
    })
  .command('balance <module>',
    'Tell a module to balance itself and stream the voltages as they change',
    (args: Argv) => {
        args.positional('module', {
            describe: 'module number',
            type: 'number',
        });
    },
    async (argv: {module: number}) => {
        const teslaComms = await connect();
        try {
            const module = new TeslaModule(teslaComms, argv.module);
            while (true) {
                const result = await module.balanceIfNeeded(0.1, 60);
                const spread = module.getMaxVoltage() - module.getMinVoltage();
                const cells = module.cellVoltages.map(v => v.toFixed(3)).join(', ');
                const totalVolts = module.cellVoltages.reduce((a, b) => a + b, 0);
                const balanceMessage = result.map(b => b ? 'X': ' ').join('|');
                console.log(`Spread: ${(spread * 1000).toFixed(0)}mV, balance: ${balanceMessage}, cells: ${cells}, total: ${totalVolts.toFixed(3)}V, moduleVolts: ${module.moduleVolt?.toFixed(3)}V`);
                await sleep(60000);
            }
        } finally {
            await teslaComms.close();
        }
    })
  .parse();

async function connect() {
  const serial = new SerialWrapper('/dev/ttyUSB0', 612500);
  await serial.open();
  const teslaComms = new TeslaComms(serial);
  return teslaComms;
}
