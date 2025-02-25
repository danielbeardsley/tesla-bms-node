import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { TeslaComms } from '../tesla-comms';
import { SerialWrapper } from '../serial-wrapper';
import { BMSBoard } from '../bms-board';

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
    (yargs) => {
        yargs.positional('module', {
            describe: 'module number',
            type: 'number',
        });
    },
    async (argv: {module: number}) => {
        const teslaComms = await connect();
        const module = new BMSBoard(teslaComms, parseInt(argv.module));
        await module.setBalanceTimer(60, false);
        await module.balance([true, true, false, true, true, true]);
        await module.readValues();
        while (true) {
            await module.readValues();
            const spread = module.getMaxVoltage() - module.getMinVoltage();
            const cells = module.cellVoltages.map(v => v.toFixed(3)).join(', ');
            const totalVolts = module.cellVoltages.reduce((a, b) => a + b, 0);
            console.log(`Spread: ${(spread * 1000).toFixed(0)}mV, cells: ${cells}, total: ${totalVolts.toFixed(3)}V, moduleVolts: ${module.moduleVolt?.toFixed(3)}V`);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
        await teslaComms.close();
    })
  .parse();

async function connect() {
  const serial = new SerialWrapper('/dev/ttyUSB0', 612500);
  await serial.open();
  const teslaComms = new TeslaComms(serial);
  return teslaComms;
}
