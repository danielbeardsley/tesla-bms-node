import { Battery } from './src/battery/battery';
import { TeslaComms } from './src/battery/tesla-comms';
import { SerialWrapper } from './src/comms/serial-wrapper';
import { getConfig } from './src/config';
import { Downtime } from './src/history/downtime';
import { BMS } from './src/bms/bms';
import { Pylontech } from './src/inverter/pylontech';
import { CanbusSerialPort } from './src/inverter/canbus';
import { SerialPort } from 'serialport';
import { VictronSmartShunt } from './src/battery/shunt';
import { batteryLogger, inverterLogger, logger } from './src/logger';
import { discoverModules } from './src/battery/tesla-module-factory';
import { Storage } from './src/storage';
import { setupResetButton } from './src/gpio-reset';

async function getTeslaComms() {
   const config = getConfig();
   const serialConfig = config.battery.serialPort;
   const serial = new SerialWrapper(serialConfig.deviceName, TeslaComms.BAUD, "tesla bms ttl");
   void serial.open();
   return new TeslaComms(serial);
}

async function getBattery() {
   const config = getConfig();
   batteryLogger.info('Starting battery communications');
   const teslaComms = await getTeslaComms();
   batteryLogger.info('Tesla comms initialized');
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
   const downtime = new Downtime(path, 'shunt', config.battery.shunt.downtimeS * 1_000);
   return new VictronSmartShunt(port, downtime);
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
   void serial.open();
   inverterLogger.info('Serial port open');
   return new Pylontech(serial);
}

async function getCanbusInverter(battery: Battery) {
   const config = getConfig();
   const canbusConfig = config.inverter.canbusSerialPort;
   const serial = new CanbusSerialPort(
      canbusConfig.deviceName,
      canbusConfig.baudRate,
      "canbus",
      battery,
   );
   return serial;
}

async function main() {
   const config = getConfig();
   if (config.resetButton) {
      setupResetButton(config.resetButton);
   }
   const storage = new Storage('./storage.json');
   await storage.load();
   const battery = getBattery();
   const inverter = getInverter();
   const canbusInverter = getCanbusInverter(await battery);
   const bms = new BMS(await battery, await inverter, await canbusInverter, getConfig(), storage);
   await bms.init();
   await bms.start();
}

main().catch((e)=> {
   logger.error('Failed to start', e);
   process.exit(1);
})
