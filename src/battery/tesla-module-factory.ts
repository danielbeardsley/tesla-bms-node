async init(renumberOnFailure: boolean = true) {
   const { found, missing } = await this.findModules();
   if (missing.length > 0) {
      const missingIds = missing.join(', ');
      if (renumberOnFailure) {
         logger.error("Unable to communicate with modules: %s - trying to renumber them", missingIds);
         await this.teslaComms.renumberModules(this.config.battery.moduleCount);
         await this.init(false);
         return;
      }
      const msg = `Unable to communicate with modules: ${missingIds} - giving up`;
      logger.error(msg);
      throw new Error(msg);
   }

   for (const moduleNumber of found) {
      this.modules[moduleNumber] = new TeslaModule(this.teslaComms, moduleNumber);
   }
}

private async findModules() {
   logger.info('Trying to find %d modules', this.config.battery.moduleCount);
   let moduleNumber: number;
   const missing: number[] = [];
   const found: number[] = [];

   for (moduleNumber = 1; moduleNumber <= this.config.battery.moduleCount; moduleNumber++) {
      await this.lock
         .acquire('key', () => this.teslaComms.isModuleAlive(moduleNumber))
         .then(alive => {
            if (alive) {
               found.push(moduleNumber);
               logger.debug(`Module ${moduleNumber} found`);
            } else {
               missing.push(moduleNumber);
               logger.warn(`Module ${moduleNumber} not found`);
            }
         });
   }

   logger.info(`Found modules: [${found.join(', ')}]` + (missing.length > 0 ? ` - missing: [${missing.join(', ')}]` : ''));
   return { found, missing };
}
