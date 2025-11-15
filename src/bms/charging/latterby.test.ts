import { describe, it, expect } from 'vitest';
import { Latterby } from './latterby';
import { getTestConfig } from '../../test-config'
import { FakeBattery } from '../fake-battery';
import { Config } from "../../config";
import { sleep } from '../../utils';
import { StorageInterface, type StorageValues } from '../../storage';

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

   it('Should charge to 100% if been longer than configured since a full charge', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery} = initialize(
         {rechargeDelaySec: 0, daysBetweenSynchronizations: 4},
         {lastFullCharge: Date.now() - (3 * 24 * 60 * 60 * 1000)} // 3 days ago
      );

      const chargeInfo = () => latterby.getChargeDischargeInfo();

      battery.stateOfCharge = 0.5;
      // 50% < 80% and this should enable charging
      expect(chargeInfo().chargingEnabled).toBe(true);

      battery.stateOfCharge = 0.9;
      // We're above the stopChargeAtPct, so charging should be disabled
      expect(chargeInfo().chargingEnabled).toBe(false);
      // Change this to be less than the time since last full charge
      latterbyConfig.daysBetweenSynchronizations = 2
      // Now we should be doing a synchronization charge, so charging should be
      // enabled despote the SOC
      expect(chargeInfo().chargingEnabled).toBe(true);

      // Change this to be greater than the time since last full charge
      latterbyConfig.daysBetweenSynchronizations = 10
      // We should now disable charging again
      expect(chargeInfo().chargingEnabled).toBe(false);
   });

   it('Should charge to 100% via grid when configured to', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery} = initialize(
         {rechargeDelaySec: 0, daysBetweenSynchronizations: 5, chargeFromGridDelayDays: 2},
         {lastFullCharge: Date.now() - (3 * 24 * 60 * 60 * 1000)} // 4 days ago
      );

      const chargeInfo = () => latterby.getChargeDischargeInfo();

      battery.stateOfCharge = 0.9;
      // We're above the stopChargeAtPct, so charging should be disabled
      expect(chargeInfo().chargingEnabled).toBe(false);
      // Change this to be less than the time since last full charge
      latterbyConfig.daysBetweenSynchronizations = 2
      // Now we should be doing a synchronization charge, so charging should be
      // enabled despite the SOC, but not from the grid yet.
      expect(chargeInfo().chargingEnabled).toBe(true);
      expect(chargeInfo().chargeFromGrid).toBe(false);

      // Change this so that we're past the grid charge delay
      latterbyConfig.daysBetweenSynchronizations = 0
      // Now we should be doing a synchronization charge from the grid
      expect(chargeInfo().chargingEnabled).toBe(true);
      expect(chargeInfo().chargeFromGrid).toBe(true);
      // Change this to be greater than the time since last full charge
      latterbyConfig.daysBetweenSynchronizations = 10
      // We should now disable charging again
      expect(chargeInfo().chargingEnabled).toBe(false);
      expect(chargeInfo().chargeFromGrid).toBe(false);
   });

   it('Should detect full charge and report to storage', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery, storage} = initialize({
         synchronizationVoltage: 49,
      });
      battery.voltage = 48;

      const chargeInfo = () => latterby.getChargeDischargeInfo();
      let prevLastFullCharge = Number(storage.get().lastFullCharge);

      battery.stateOfCharge = 0.5;
      await sleep(10);
      chargeInfo();
      // Assert is isn't updated yet
      expect(storage.get().lastFullCharge).toBe(prevLastFullCharge);

      // SOC: 100% but voltage is still below sync voltage, so shouldn't be
      // considered full
      battery.stateOfCharge = 1;
      await sleep(10);
      chargeInfo();
      expect(storage.get().lastFullCharge).toBe(prevLastFullCharge);

      // SOC: 100% and voltage is now at sync voltage, so it should be
      // considered full, and thus lastFullCharge should be updated
      battery.stateOfCharge = 1;
      battery.voltage = latterbyConfig.synchronizationVoltage;
      await sleep(10);
      chargeInfo();
      expect(storage.get().lastFullCharge).toBeGreaterThan(prevLastFullCharge);
      prevLastFullCharge = Number(storage.get().lastFullCharge);

      // SOC below 100% while voltage is still at sync voltage, so shouldn't be
      // considered full, and thus lastFullCharge shouldn't be updated
      battery.stateOfCharge = 0.99;
      battery.voltage = latterbyConfig.synchronizationVoltage;
      await sleep(10);
      chargeInfo();
      expect(storage.get().lastFullCharge).toBe(prevLastFullCharge);
   });


   it('Should cap the SOC if a full charge is requested', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery} = initialize(
         {rechargeDelaySec: 0, daysBetweenSynchronizations: 4},
         {lastFullCharge: Date.now() - (3 * 24 * 60 * 60 * 1000)} // 3 days ago
      );

      battery.stateOfCharge = 1;
      expect(latterby.getStateOfCharge()).toBe(1);

      // Change this config so a full charge is requested
      latterbyConfig.daysBetweenSynchronizations = 2
      battery.stateOfCharge = 1;
      expect(latterby.getStateOfCharge()).toBe(0.99);

      // Set a super-high SOC to prove we ignore it
      battery.stateOfCharge = 1.5;
      expect(latterby.getStateOfCharge()).toBe(0.99);

      // Charging should be disabled when we reach the sync voltage
      battery.stateOfCharge = 0.5;
      expect(latterby.getStateOfCharge()).toBe(0.5);
   });
});

function initialize(
   latterbyConfigOverride: Partial<Config['bms']['chargingStrategy']['latterby']> = {},
   storageOverride: Partial<StorageValues> = {},
) {
   let storageValues = {
      lastFullCharge: Date.now(),
      ...storageOverride
   } as StorageValues;
   const storage = {
      get: () => ({
         ...storageValues,
      }),
      update: (values: Partial<StorageValues>) => {
         storageValues = values
      }
   } as StorageInterface;
   const battery = new FakeBattery();
   battery.stateOfCharge = 0.5
   const config = getTestConfig();
   config.bms.chargingStrategy.latterby = {
         stopDischargeAtPct: 20,
         resumeDischargeAtPct: 30,
         stopChargeAtPct: 80,
         resumeChargeAtPct: 70,
         rechargeDelaySec: 600,
         daysBetweenSynchronizations: 10,
         synchronizationVoltage: 49,
         ...latterbyConfigOverride
   };
   const latterby = new Latterby(config, battery, storage);
   return {latterby, config, latterbyConfig: config.bms.chargingStrategy.latterby, battery, storage};
}
