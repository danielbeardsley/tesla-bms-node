import { describe, it, expect } from 'vitest';
import { Latterby } from './latterby';
import { getTestConfig } from '../../test-config'
import { FakeBattery } from '../fake-battery';
import { Config } from "../../config";
import { sleep } from '../../utils';

describe('Latterby Charging', () => {
   it('Should enable chaging based on SOc', async () => {
      const {latterby, config, battery} = initialize();
      battery.stateOfCharge = 0.5;
      let charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(true);
      expect(charge.chargeCurrentLimit).toBe(config.battery.charging.maxAmps);

      battery.stateOfCharge = 0.1;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(true);
      expect(charge.chargeCurrentLimit).toBe(config.battery.charging.maxAmps);
      expect(charge.dischargingEnabled).toBe(false);
      expect(charge.dischargeCurrentLimit).toBe(config.battery.discharging.maxAmps);

      battery.stateOfCharge = 0.9;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(false);
      expect(charge.chargeCurrentLimit).toBe(0);
   });

   it('Should disable charging when full until dropping below resumeChargeAtPct', async () => {
      const {latterby, battery} = initialize({rechargeDelaySec: 0});
      battery.stateOfCharge = 0.5;
      let charge = latterby.getChargeDischargeInfo();

      // We're full (80% is full)
      battery.stateOfCharge = 0.8;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(false);

      // Back to not full
      battery.stateOfCharge = 0.78;
      charge = latterby.getChargeDischargeInfo();
      // Since we were recently full, charging should be disabled
      expect(charge.chargingEnabled).toBe(false);

      // Back to below resumeChargeAtPct
      battery.stateOfCharge = 0.68;
      charge = latterby.getChargeDischargeInfo();
      // Since we're just below resumeChargeAtPct charging should be enabled
      expect(charge.chargingEnabled).toBe(true);
   });
 
   it('Should disable discharging when recently empty', async () => {
      const {latterby, battery} = initialize({rechargeDelaySec: 0});
      battery.stateOfCharge = 0.5;
      let charge = latterby.getChargeDischargeInfo();

      // We're full (20% is empty)
      battery.stateOfCharge = 0.2;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.dischargingEnabled).toBe(false);

      // Back to not empty
      battery.stateOfCharge = 0.21;
      charge = latterby.getChargeDischargeInfo();
      // Since we were recently empty, charging should be disabled
      expect(charge.dischargingEnabled).toBe(false);

      // Back to above resumeDischargeAtPct
      battery.stateOfCharge = 0.31;
      charge = latterby.getChargeDischargeInfo();
      // Since we're just above resumeDischargeAtPct charging should be enabled
      expect(charge.dischargingEnabled).toBe(true);
   });

   it('Should disable charging when recently full', async () => {
      const {latterby, battery} = initialize({resumeChargeAtPct: 80, rechargeDelaySec: 0.05});
      battery.stateOfCharge = 0.5;

      // We're full (80% is full)
      battery.stateOfCharge = 0.8;
      let charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(false);

      // Back to not full
      battery.stateOfCharge = 0.79;
      charge = latterby.getChargeDischargeInfo();
      // Since we were recently full, charging should be disabled
      expect(charge.chargingEnabled).toBe(false);

      // After waiting the recharge delay, charging should be enabled again
      await sleep(100);
      charge = latterby.getChargeDischargeInfo();
      // Since we're just below resumeChargeAtPct charging should be enabled
      expect(charge.chargingEnabled).toBe(true);
   });

   it('Should charge based on voltage on specified days', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery} = initialize({rechargeDelaySec: 0});

      battery.stateOfCharge = 0.5;
      let charge = latterby.getChargeDischargeInfo();
      // 50% < 80% and this should enable charging
      expect(charge.chargingEnabled).toBe(true);

      battery.stateOfCharge = 0.9;
      // Inlcude today in the list of days to do a synchronization charge
      latterbyConfig.synchronizationDaysOfMonth = [new Date().getDate()];
      // Sync charge == keep charging till we're above this voltage
      battery.voltage = latterbyConfig.synchronizationVoltage - 1;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(true);

      // Set a super-high SOC to prove we ignore it
      battery.stateOfCharge = 1.5;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(true);

      // Charging should be disabled when we reach the sync voltage
      battery.voltage = latterbyConfig.synchronizationVoltage;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(false);
   });

   it('Should cap the SOC on specified days', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery} = initialize({rechargeDelaySec: 0});

      battery.stateOfCharge = 1;
      let soc = latterby.getStateOfCharge();
      // 90%  > 80% and this should disable charging
      expect(soc).toBe(1);

      // Inlcude today in the list of days to do a synchronization charge
      latterbyConfig.synchronizationDaysOfMonth = [new Date().getDate()];
      battery.stateOfCharge = 1;
      soc = latterby.getStateOfCharge();
      expect(soc).toBe(0.99);

      // Set a super-high SOC to prove we ignore it
      battery.stateOfCharge = 1.5;
      soc = latterby.getStateOfCharge();
      expect(soc).toBe(0.99);

      // Charging should be disabled when we reach the sync voltage
      battery.stateOfCharge = 0.5;
      soc = latterby.getStateOfCharge();
      expect(soc).toBe(0.5);
   });
});

function initialize(latterbyConfigOverride: Partial<Config['bms']['chargingStrategy']['latterby']> = {}) {
   const battery = new FakeBattery();
   battery.stateOfCharge = 0.5
   const config = getTestConfig();
   config.bms.chargingStrategy.latterby = {
         stopDischargeAtPct: 20,
         resumeDischargeAtPct: 30,
         stopChargeAtPct: 80,
         resumeChargeAtPct: 70,
         rechargeDelaySec: 600,
         synchronizationVoltage: 48,
         synchronizationDaysOfMonth: [],
         ...latterbyConfigOverride
   };
   const latterby = new Latterby(config, battery);
   return {latterby, config, latterbyConfig: config.bms.chargingStrategy.latterby, battery};
}
