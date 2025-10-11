import { usbAddrFromSerial } from './usb-utils';
import { promisify } from 'node:util';
import child_process from 'node:child_process';

const execFile = promisify(child_process.execFile);

type Device = {
   devicePath: string;
   name: string;
   isUp: boolean;
   timeSinceLastUpS: number;
   timeoutMs: number;
};

const DRY_RUN = !process.argv.includes('--act');

// If a device has been down for this many times its timeout, do a full system reboot
const TOO_LONG_REBOOT_FACTOR = 10;
const BMS_URL = 'http://127.0.0.1:8080/current';

getDeviceUptimesFromBMS().then(checkForDownDevices);

async function checkForDownDevices(deviceUptimes: Device[]) {
   for (const device of deviceUptimes) {
      const tooLongTimeS = (device.timeoutMs / 1000) * TOO_LONG_REBOOT_FACTOR;
      if (device.timeSinceLastUpS > tooLongTimeS) {
         console.error(`Device ${device.name} at ${device.devicePath} has been down so long ${device.timeSinceLastUpS}s, that rebooting is the best option`);
         await rebootSystem();
      }

      if (!device.isUp) {
         console.error(`Device ${device.name} at ${device.devicePath} has been down for ${device.timeSinceLastUpS}s, resetting the usb device`);
         await resetUsb(device);
      }
   }
}

async function rebootSystem() {
   if (DRY_RUN) {
      console.log("Dry run, not rebooting");
      return;
   }
   await execFile('reboot');
}

async function resetUsb(device: Device) {
   const address = usbAddrFromSerial(device.devicePath);
   if (address === null) {
      return;
   }
   if (DRY_RUN) {
      console.log(`Dry run, not resetting USB device at ${address.bus}:${address.dev}`);
      return;
   }
   await execFile('resetusb', [`${address.bus}:${address.dev}`]);
}

async function getDeviceUptimesFromBMS(): Promise<Device[]> {
   try {
      const response = await fetch(BMS_URL);
      if (!response.ok) {
         throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const json = await response.json() as {downtime: Record<string, Device>};
      return Object.values(json.downtime);
   } catch (err) {
      console.error("Error fetching JSON:", err);
      return [];
   }
}
