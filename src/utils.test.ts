import { describe, it, expect } from 'vitest';
import { ramp, clamp, StickyBool, sleep, ProtectedBool } from './utils';

describe("utils", () => {
   describe("ramp()", () => {
      it("should make a linear transition at the bottom end of a ramp", () => {
         expect(ramp(10, 10, 20)).toBe(0);
         expect(ramp(15, 10, 20)).toBe(0.5);
         expect(ramp(19, 10, 20)).toBe(0.9);
         expect(ramp(3253, 10, 20)).toBe(1);
         expect(ramp(-3434, 10, 20)).toBe(0);
      });
      it("should make a linear transition at the top end of a ramp", () => {
         expect(ramp(10, 20, 10)).toBe(1);
         expect(ramp(15, 20, 10)).toBe(0.5);
         expect(ramp(19, 20, 10)).toBe(0.1);
         expect(ramp(3253, 20, 10)).toBe(0);
         expect(ramp(-3434, 20, 10)).toBe(1);
      });
   });

   describe("clamp()", () => {
      it("should keep a value in range", () => {
         expect(clamp(10, 10, 20)).toBe(10);
         expect(clamp(15, 10, 20)).toBe(15);
         expect(clamp(19, 10, 20)).toBe(19);
         expect(clamp(3253, 10, 20)).toBe(20);
         expect(clamp(-3434, 10, 20)).toBe(10);
      });
   });

   describe("StickyBool", () => {
      it("should start in the initial state", () => {
         let sb = new StickyBool(true, 1, 1);
         expect(sb.get()).toBe(true);
         sb = new StickyBool(false, 1, 1);
         expect(sb.get()).toBe(false);
      });

      it("should stick to true as long as configured", async () => {
         const sb = new StickyBool(false, 0.005, 0);
         sb.set(true);
         expect(sb.get()).toBe(true);
         sb.set(false);
         expect(sb.get()).toBe(true);
         await sleep(5);
         sb.set(false);
         expect(sb.get()).toBe(false);
      });

      it("should stick to false as long as configured", async () => {
         const sb = new StickyBool(true, 0, 0.005);
         sb.set(false);
         expect(sb.get()).toBe(false);
         sb.set(true);
         expect(sb.get()).toBe(false);
         await sleep(6);
         sb.set(true);
         expect(sb.get()).toBe(true);
      });

      it("getRemainingS() should return time left before value can change", async () => {
         const sb = new StickyBool(true, 0, 0.050);
         sb.set(false);
         expect(sb.get()).toBe(false);
         // Just transitioned to false with 50ms sticky duration
         expect(sb.getRemainingS()).toBeGreaterThan(0.02);
         expect(sb.getRemainingS()).toBeLessThanOrEqual(0.05);
         await sleep(60);
         expect(sb.getRemainingS()).toBe(0);
      });

      it("getRemainingS() should return 0 when sticky time has already elapsed", () => {
         // minTrueDurationS=0, so true value can change immediately
         const sb = new StickyBool(true, 0, 1);
         expect(sb.getRemainingS()).toBe(0);
      });

      it("getRemainingS() should use the correct duration for the current value", async () => {
         // true sticks for 0.010s, false sticks for 0.2s
         const sb = new StickyBool(true, 0.010, 0.2);
         expect(sb.getRemainingS()).toBeLessThanOrEqual(0.010);
         expect(sb.getRemainingS()).toBeGreaterThan(0);

         // Wait for true sticky time to elapse, then transition to false
         await sleep(15);
         sb.set(false);
         expect(sb.get()).toBe(false);
         // Now in false state, should use minFalseDurationS (0.2)
         expect(sb.getRemainingS()).toBeLessThanOrEqual(0.2);
         expect(sb.getRemainingS()).toBeGreaterThan(0.1);
      });

      it("should stick to a state as long as configured even when rapid cycling without getting", async () => {
         const t = new StickyBool(true, 0, 0.005);
         t.set(false);
         t.set(true);
         expect(t.get()).toBe(false);
         await sleep(10);
         t.set(true);
         expect(t.get()).toBe(true);

         const f = new StickyBool(false, 0.005, 0.005);
         f.set(true);
         f.set(false);
         expect(f.get()).toBe(false);
         await sleep(10);
         f.set(false);
         expect(f.get()).toBe(false);
      });
   });

   describe("ProtectedBool()", () => {
      it("should require the trueAllowed param to transition to true", () => {
         const pb = new ProtectedBool(false);
         expect(pb.get()).toBe(false);
         // True to update without the check being true
         pb.update(true, false);
         expect(pb.get()).toBe(false);

         pb.update(true, true);
         expect(pb.get()).toBe(true);

         pb.update(false, false);
         expect(pb.get()).toBe(false);

         pb.update(false, true);
         expect(pb.get()).toBe(false);
      });

      it("should accept an arg that is the current value", () => {
         expect((new ProtectedBool(true)).get()).toBe(true);
         expect((new ProtectedBool(false)).get()).toBe(false);
      });
   });
});
