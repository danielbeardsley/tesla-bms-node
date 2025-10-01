import { describe, it, expect } from 'vitest';
import { Latterby } from './latterby';
import { getTestConfig } from '../../test-config'
import { FakeBattery } from '../fake-battery';
import {sleep} from '../../utils';
import {Config} from "../../config";

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

   it('Should disable charging when recently full', async () => {
      const {latterby, latterbyConfig, battery} = initialize({rechargeDelaySec: 0.01});
      battery.stateOfCharge = 0.5;
      let charge = latterby.getChargeDischargeInfo();

      // We're full (80% is full)
      battery.stateOfCharge = 0.9;
      charge = latterby.getChargeDischargeInfo();
      expect(charge.chargingEnabled).toBe(false);

      // Back to not full
      battery.stateOfCharge = 0.5;
      charge = latterby.getChargeDischargeInfo();
      // Since we were recently full, charging should be disabled
      expect(charge.chargingEnabled).toBe(false);

      // Wait till after rechargeDelaySec
      await sleep(latterbyConfig.rechargeDelaySec * 1000);

      charge = latterby.getChargeDischargeInfo();
      // Since time has passed, we should be allowed to charge again
      expect(charge.chargingEnabled).toBe(true);
   });

   it('Should charge based on voltage on specified days', async () => {
      // Turn off the recharge delay so we can see effects immediately
      const {latterby, latterbyConfig, battery} = initialize({rechargeDelaySec: 0});

      battery.stateOfCharge = 0.9;
      let charge = latterby.getChargeDischargeInfo();
      // 90%  > 80% and this should disable charging
      expect(charge.chargingEnabled).toBe(false);

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
         stopChargeAtPct: 80,
         rechargeDelaySec: 600,
         synchronizationVoltage: 48,
         synchronizationDaysOfMonth: [],
         ...latterbyConfigOverride
   };
   const latterby = new Latterby(config, battery);
   return {latterby, config, latterbyConfig: config.bms.chargingStrategy.latterby, battery};
}
