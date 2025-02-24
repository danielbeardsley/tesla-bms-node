
var pack = new BMSPack('/dev/ttyUSB0');

initPack(pack)
   .then(() => pack.wakeBoards())
   .then(async () => {
      for (var key in pack.modules) {
         var module = pack.modules[key];
         await module
            .readIOControl()
            .then(ioControl => {})
            .then(() => {
               return module.readStatus();
            })
            .then(() => {
               return module.readValues();
            })
            .then(() => {
               return module.readConfig();
            })
            .then(() => {
               return module.sleep();
            })
            .then(() => {
               // return module.readStatus();
            })
            .then(() => {
               console.log(module.cellVoltages);
               console.log(module.temperatures);
            });
      }
   })
   .then(async () => {
      while (true) {
         try {
            await pack.modules[1].readValues();
         } catch (error) {
            console.error('Error reading values: ', error);
         }
         await sleep(1000);
      }
   })
   .catch(error => {
      console.error('Error: ', error);
   });

async function initPack(pack: BMSPack) {
   await pack.init();
}

async function sleep(ms: number) {
   return new Promise(resolve => setTimeout(resolve, ms));
}
