import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .command('renumber', 're-index and re-number the modules')
  .parse()

console.log(argv);