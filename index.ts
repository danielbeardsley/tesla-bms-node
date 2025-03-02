import { Battery } from './src/battery/battery';
import { TeslaComms } from './src/battery/tesla-comms';
import { SerialWrapper } from './src/battery/serial-wrapper';
import { getConfig } from './src/config';
import { BMS } from './src/bms/bms';
import { logger } from './src/logger';

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

async function main() {
   const battery = await getBattery();
   const bms = new BMS(battery, getConfig());
   bms.startMonitoring();
}

main().then(()=> logger.info('exiting!'));
