import { BMSPack } from "./src/bms-pack";
import { sleep } from "./src/utils";

var pack = new BMSPack('/dev/ttyUSB0');

pack.init()
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
