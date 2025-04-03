import { TeslaComms } from './tesla-comms';
import { TeslaModule } from './tesla-module';
import type { Config } from '../config';
import { batteryLogger as logger } from '../logger';

export async function discoverModules(teslaComms: TeslaComms, config: Config, renumberOnFailure: boolean): Promise<TeslaModule[]> {
   const { found, missing } = await findModules(teslaComms, config);
   if (missing.length > 0) {
      const missingIds = missing.join(', ');
      if (renumberOnFailure) {
         logger.error("Unable to communicate with modules: %s - trying to renumber them", missingIds);
         await teslaComms.renumberModules(config.battery.moduleCount);
         return discoverModules(teslaComms, config, false);
      }
      const msg = `Unable to communicate with modules: ${missingIds} - giving up`;
      logger.error(msg);
      throw new Error(msg);
   }

   const modules: TeslaModule[] = [];
   for (const moduleNumber of found) {
      modules[moduleNumber] = new TeslaModule(teslaComms, moduleNumber);
   }
   return modules;
}

async function findModules(teslaComms: TeslaComms, config: Config) {
   logger.info('Trying to find %d modules', config.battery.moduleCount);
   let moduleNumber: number;
   const missing: number[] = [];
   const found: number[] = [];

   for (moduleNumber = 1; moduleNumber <= config.battery.moduleCount; moduleNumber++) {
      if (await teslaComms.isModuleAlive(moduleNumber)) {
         found.push(moduleNumber);
         logger.debug(`Module ${moduleNumber} found`);
      } else {
         missing.push(moduleNumber);
         logger.warn(`Module ${moduleNumber} not found`);
      }
   }

   logger.info(`Found modules: [${found.join(', ')}]` + (missing.length > 0 ? ` - missing: [${missing.join(', ')}]` : ''));
   return { found, missing };
}
