import { Battery } from './src/battery';
import { sleep } from './src/utils';

const battery = new Battery('/dev/ttyUSB0');

battery
   .init()
   .then(() => battery.wakeBoards())
   .then(async () => {
      for (const key in battery.modules) {
         const module = battery.modules[key];
         await module
            .readIOControl()
            .then(() => {
               return module.readStatus();
            })
            .then(() => {
               return module.readValues();
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
            await battery.modules[1].readValues();
         } catch (error) {
            console.error('Error reading values: ', error);
         }
         await sleep(1000);
      }
   })
   .catch(error => {
      console.error('Error: ', error);
   });
