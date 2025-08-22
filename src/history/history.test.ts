import { describe, it, expect } from 'vitest';
import { History } from './history';

describe('History module', () => {
   it('Should take in samples and return them in the same order', () => {
      const samples = 3;
      const history = new History(100);
      addSamples(history, samples);
      const values = history.getValues();
      expect(values.batteryVolts).toEqual([1, 2, 3]);
   });

   it('Should write samples in a circular buffer', () => {
      const samples = 7;
      const history = new History(5);
      addSamples(history, samples);
      const values = history.getValues();
      expect(values.batteryVolts).toEqual([3, 4, 5, 6, 7]);
   });

   it('Should return only the most recent N samples', () => {
      const samples = 7;
      const history = new History(5);
      addSamples(history, samples);
      const values3 = history.getValues(3);
      const values2 = history.getValues(2);
      const values1 = history.getValues(1);
      expect(values3.batteryVolts).toEqual([5, 6, 7]);
      expect(values2.batteryVolts).toEqual([6, 7]);
      expect(values1.batteryVolts).toEqual([7]);

      expect(values2.tesla.total).toEqual([12, 13]);
   });
});

function addSamples(history: History, samples: number) {
   for (let i = 0; i < samples; i++) {
      history.add(i, {
         batteryVolts: i+1,
         batteryAmps: i+20,
         batteryWatts: i+21,
         batteryCellVoltsMin: i+2,
         batteryCellVoltsMax: i+3,
         batteryTempMin: i+4,
         batteryTempMax: i+5,
         tesla: packetStats(i+7, i+8),
         rs485: packetStats(i+9, i+10),
         shunt: packetStats(i+11, i+12),
         canbus: packetStats(i+13, i+14),
      });
   }
}

function packetStats(total: number, bad: number) {
   return {
      total,
      bad,
   };
}

