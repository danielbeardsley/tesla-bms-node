import { describe, it, expect } from 'vitest';
import { FakeModule, getFakeShunt } from '../bms/fake-battery';
import { getTestConfig } from '../test-config'
import { Battery } from './battery';

describe('Battery', () => {
   describe('.getVoltage', () => {
      it('should use the cell volts', async () => {
         const modules = [
            new FakeModule([1, 2], [21], 5),
            new FakeModule([2, 3], [21], 10)
         ];
         const config = getTestConfig();
         const battery = new Battery(modules, getFakeShunt(), config);
         // Should be average of sums of modules, not moduleVolts
         expect(battery.getVoltage()).toBe(8);
      });
   });
});

