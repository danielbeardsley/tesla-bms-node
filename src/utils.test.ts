import { describe, it, expect } from 'vitest';
import { ramp, clamp } from './utils';

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
});
