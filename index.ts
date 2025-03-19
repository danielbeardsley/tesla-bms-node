import { Battery } from './src/battery/battery';
import { TeslaComms } from './src/battery/tesla-comms';
import { SerialWrapper } from './src/comms/serial-wrapper';
import { getConfig } from './src/config';
import { BMS } from './src/bms/bms';
import { Pylontech } from './src/inverter/pylontech';
import { batteryLogger, inverterLogger, logger } from './src/logger';

async function getTeslaComms() {
   const config = getConfig();
   const serialConfig = config.battery.serialPort;
   const serial = new SerialWrapper(serialConfig.deviceName, TeslaComms.BAUD);
   await serial.open();
   return new TeslaComms(serial);
}

async function getBattery() {
   const config = getConfig();
   batteryLogger.info('Starting battery communications');
   const teslaComms = await getTeslaComms();
   batteryLogger.info('Serial port open');
   const battery = new Battery(teslaComms, config);
   return battery;
}

async function getInverter() {
   const config = getConfig();
   inverterLogger.info('Starting inverter communications');
   const inverterConfig = config.inverter.serialPort;
   const serial = new SerialWrapper(
      inverterConfig.deviceName,
      inverterConfig.baudRate);
   await serial.open();
   inverterLogger.info('Serial port open');
   return new Pylontech(serial);
}

async function main() {
   const battery = await getBattery();
   const inverter = await getInverter();
   const bms = new BMS(battery, inverter, getConfig());
   bms.init();
   bms.start();
}

main().then(()=> logger.info('exiting!'));
