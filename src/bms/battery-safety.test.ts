import { describe, it, expect } from 'vitest';
import { FakeBattery } from './fake-battery';
import { BatterySafety } from './battery-safety';
import { getTestConfig } from '../test-config';

describe('Battery Saftey Module', () => {
   it('should allow or disallow charging as max cellV approaches the max', async () => {
      const battery = getBatteryWithRange(3.8, 3.9);
      const config = getTestConfig();
      const safe = new BatterySafety(config, battery, 0);
      safe.secondsSinceLastCall = () => 1; // pretend it's been 1 second for smoothing

      config.battery.safety.maxCellVoltBuffer = 0.1;
      config.battery.safety.maxCellVolt = 4;
      let charging = safe.getChargeDischargeInfo();
      const maxAmps = config.battery.charging.maxAmps;
      expect(charging.chargeCurrentLimit).toBe(maxAmps);
      expect(charging.chargingEnabled).toBe(true);

      // Half of the buffer from the max
      config.battery.safety.maxCellVolt = 3.95;
      charging = safe.getChargeDischargeInfo();
      expect(charging.chargeCurrentLimit).toBe(maxAmps * 0.5);
      expect(charging.chargingEnabled).toBe(true);

      // At the max
      config.battery.safety.maxCellVolt = 3.9;
      charging = safe.getChargeDischargeInfo();
      expect(charging.chargeCurrentLimit).toBe(0);
      expect(charging.chargingEnabled).toBe(false);
   });

   it('should allow or disallow discharging as min cellV approaches the min', async () => {
      const battery = getBatteryWithRange(3.8, 3.9);
      const config = getTestConfig();
      const safe = new BatterySafety(config, battery, 0);

      config.battery.safety.minCellVolt = 3;
      let charging = safe.getChargeDischargeInfo();
      const maxAmps = config.battery.discharging.maxAmps;
      expect(charging.dischargeCurrentLimit).toBe(maxAmps);
      expect(charging.dischargingEnabled).toBe(true);

      // Close to the min
      config.battery.safety.minCellVolt = 3.7999;
      expect(charging.dischargeCurrentLimit).toBe(maxAmps);
      expect(charging.dischargingEnabled).toBe(true);

      // Below the min
      config.battery.safety.minCellVolt = 3.81;
      charging = safe.getChargeDischargeInfo();
      // We don't change the limit, but we do toggle the dischargeEnabled bool
      expect(charging.dischargeCurrentLimit).toBe(maxAmps);
      expect(charging.dischargingEnabled).toBe(false);
   });

   it('should do smoothing on charge current', async () => {
      const battery = getBatteryWithRange(3.8, 3.9);
      const config = getTestConfig();
      const smoothing = 0.5;
      const safe = new BatterySafety(config, battery, smoothing);
      safe.secondsSinceLastCall = () => 1; // pretend it's been 1 second for smoothing

      config.battery.safety.maxCellVoltBuffer = 0.1;
      config.battery.safety.maxCellVolt = 4;
      let charging = safe.getChargeDischargeInfo();
      const maxAmps = config.battery.charging.maxAmps;
      expect(charging.chargeCurrentLimit).toBe(maxAmps  * 0.5);
      expect(charging.chargingEnabled).toBe(true);

      // very close to the max
      config.battery.safety.maxCellVolt = 3.900001;
      charging = safe.getChargeDischargeInfo();
      expect(charging.chargeCurrentLimit).toBe(maxAmps * 0.25);
      expect(charging.chargingEnabled).toBe(true);
   });

   it('should do interpolated smoothing on charge current', async () => {
      const battery = getBatteryWithRange(3.8, 3.9);
      const config = getTestConfig();
      const smoothing = 0.5;
      const safe = new BatterySafety(config, battery, smoothing);
      safe.secondsSinceLastCall = () => 2; // pretend it's been 2 seconds for smoothing

      config.battery.safety.maxCellVoltBuffer = 0.1;
      config.battery.safety.maxCellVolt = 4;
      const maxAmps = config.battery.charging.maxAmps;
      let charging = safe.getChargeDischargeInfo();
      // Interpolate from 0 to max by smoothing ^ 2 since we're pretending it's
      // been "two seconds"
      let expectedChargeAmps = maxAmps * (1-Math.pow(smoothing, 2));
      expect(charging.chargeCurrentLimit).toBe(expectedChargeAmps);
      // very close to the max, so we should interpolate towards 0
      config.battery.safety.maxCellVolt = 3.9000001;
      charging = safe.getChargeDischargeInfo();

      // very close to the max, so we should interpolate towards 0 by
      // smoothing^2
      expectedChargeAmps = Math.round(expectedChargeAmps * Math.pow(smoothing, 2));
      expect(charging.chargeCurrentLimit).toBe(expectedChargeAmps);
      expect(charging.chargingEnabled).toBe(true);
   });
});

function getBatteryWithRange(min: number, max: number) {
   const battery = new FakeBattery();
   battery.voltageRange = {min, max, spread: max-min};
   return battery;
}
