import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export function usbAddrFromSerial(devPath: string) {
   try {
      // Resolve symlink (e.g. /dev/serial/by-id/... -> /dev/ttyUSB0)
      const realNode = fs.realpathSync(devPath);

      // Get sysfs path via udevadm
      const sysRel = execSync(`udevadm info -q path -n ${realNode}`, {
         encoding: "utf8"
      }).trim();
      let sysPath = path.join("/sys", sysRel);

      // Walk upward until we find busnum + devnum
      while (
         sysPath !== "/sys" &&
         (!fs.existsSync(path.join(sysPath, "busnum")) ||
            !fs.existsSync(path.join(sysPath, "devnum")))
      ) {
         sysPath = path.dirname(sysPath);
      }

      const busnum = fs.readFileSync(path.join(sysPath, "busnum"), "utf8").trim();
      const devnum = fs.readFileSync(path.join(sysPath, "devnum"), "utf8").trim();

      return {bus: busnum.padStart(3, "0"), dev: devnum.padStart(3, "0")};
   } catch (err) {
      console.error("Error:", err.message);
      return null;
   }
}
