import { Battery } from './src/battery/battery';
import { TeslaComms } from './src/battery/tesla-comms';
import { SerialWrapper } from './src/comms/serial-wrapper';
import { getConfig } from './src/config';
import { BMS } from './src/bms/bms';
import { Pylontech } from './src/inverter/pylontech';
import { SerialPort } from 'serialport';
import { VictronSmartShunt } from './src/battery/shunt';
import { batteryLogger, inverterLogger, logger } from './src/logger';
import { discoverModules } from './src/battery/tesla-module-factory';

async function getTeslaComms() {
   const config = getConfig();
   const serialConfig = config.battery.serialPort;
   const serial = new SerialWrapper(serialConfig.deviceName, TeslaComms.BAUD, "tesla bms ttl");
   await serial.open();
   return new TeslaComms(serial);
}

async function getBattery() {
   const config = getConfig();
   batteryLogger.info('Starting battery communications');
   const teslaComms = await getTeslaComms();
   batteryLogger.info('Serial port open');
   batteryLogger.info('Discovering battery modules');
   const modules = await discoverModules(teslaComms, config, true);
   const battery = new Battery(modules, getShunt(), config);
   return battery;
}

function getShunt() {
   const config = getConfig();
   const path = config.battery.shunt.deviceName;
   const port = new SerialPort({
      path,
      baudRate: 19200,
      dataBits: 8,
      parity: 'none',
   });
   return new VictronSmartShunt(port);
}

async function getInverter() {
   const config = getConfig();
   inverterLogger.info('Starting inverter communications');
   const inverterConfig = config.inverter.serialPort;
   const serial = new SerialWrapper(
      inverterConfig.deviceName,
      inverterConfig.baudRate,
      'pylontech RS485 inverter',
   );
   await serial.open();
   inverterLogger.info('Serial port open');
   return new Pylontech(serial);
}

async function main() {
   const battery = await getBattery();
   const inverter = await getInverter();
   const bms = new BMS(battery, inverter, getConfig());
   await bms.init();
   await bms.start();
}

main().catch((e)=> {
   logger.error('Failed to start', e);
   process.exit(1);
})
