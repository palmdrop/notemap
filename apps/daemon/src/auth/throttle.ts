import type { Clock } from "@notemap/core";

const FREE = 5;
const BASE_MS = 1000;
const CAP_MS = 30_000;
const FORGET_MS = 15 * 60 * 1_000;

export type Throttle = {
  waitFor(): number;
  failed(): void;
  passed(): void;
} 

export const createLoginThrottle = ({ clock }: { clock: Clock }): Throttle => {
  let failures = 0;
  let lastFailedAt = 0;
  let openAt = 0;

  return {
    waitFor: () => Math.max(0, openAt - Date.parse(clock.now())),
    failed: () => {
      const now = Date.parse(clock.now());
      if (now - lastFailedAt > FORGET_MS) failures = 0;

      failures += 1;
      lastFailedAt = now;

      if(failures <= FREE) return;
      openAt = now + Math.min(BASE_MS * 2 ** (failures - FREE - 1), CAP_MS);
    },
    passed: () => {
      failures = 0;
      openAt = 0;
    }
  }
}
