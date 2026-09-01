import type { Clock } from "@notemap/core";

const FREE = 5;
const BASE_MS = 1000;
const CAP_MS = 30_000;
const FORGET_MS = 15 * 60 * 1_000;

export type Attempt =
  | { readonly allowed: false; readonly wait: number }
  | { readonly allowed: true; readonly settle: (worked: boolean) => void };

export type Throttle = {
  /**
   * The attempt is counted as it begins and settled when it ends. Weighing a
   * password is a memory-hard hash, and a counter advanced after it leaves
   * everything that arrived meanwhile looking like the first caller — which
   * spends the free attempts on one batch and runs that many hashes at once.
   */
  begin(): Attempt;
};

export const createLoginThrottle = ({ clock }: { clock: Clock }): Throttle => {
  let failures = 0;
  let lastAttemptedAt = 0;
  let openAt = 0;
  let weighing = false;

  return {
    begin: () => {
      const now = Date.parse(clock.now());
      const wait = Math.max(0, openAt - now);

      if (wait > 0) return { allowed: false, wait };

      // One password and one person: a second attempt arriving while the first
      // is still being weighed is nobody mistyping, and admitting it is what
      // lets a caller ask for as much memory as it cares to.
      if (weighing) return { allowed: false, wait: BASE_MS };

      if (now - lastAttemptedAt > FORGET_MS) failures = 0;

      failures += 1;
      lastAttemptedAt = now;
      weighing = true;

      if (failures > FREE) {
        openAt = now + Math.min(BASE_MS * 2 ** (failures - FREE - 1), CAP_MS);
      }

      let settled = false;

      return {
        allowed: true,
        settle: (worked) => {
          if (settled) return;
          settled = true;
          weighing = false;

          if (!worked) return;

          failures = 0;
          openAt = 0;
        },
      };
    },
  };
};
