import {
  RATE_LIMIT_RESERVE,
  RATE_LIMIT_WINDOW_MS,
  UNPACED_GAP_MS,
} from "../constants";
import { sleep } from "../utils/sleep";

/** Time as the pacer sees it, so a test can drive it without waiting. */
export type Clock = {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

export const systemClock: Clock = { now: () => Date.now(), sleep };

/** When are.na's window resets, from its headers; `undefined` where it did not say. */
export function resetOf(headers: Headers, clock: Clock): number | undefined {
  const reset = Number(headers.get("x-ratelimit-reset") ?? Number.NaN);
  if (Number.isFinite(reset)) return reset * 1000;

  const after = Number(headers.get("retry-after") ?? Number.NaN);
  if (Number.isFinite(after)) return clock.now() + after * 1000;

  return undefined;
}

/**
 * Spaces requests to are.na by what its last answer said: nothing while the
 * window has requests to spare, until the reset once it is down to the
 * reserve. An answer without rate-limit headers earns a fixed gap instead.
 */
export function pacer(clock: Clock) {
  let due = 0;

  return {
    async wait(signal?: AbortSignal): Promise<void> {
      const ms = Math.min(due - clock.now(), RATE_LIMIT_WINDOW_MS);
      if (ms > 0) await clock.sleep(ms, signal);
    },

    heard(headers: Headers): void {
      const remaining = Number(
        headers.get("x-ratelimit-remaining") ?? Number.NaN,
      );
      const reset = resetOf(headers, clock);

      if (!Number.isFinite(remaining) || reset === undefined) {
        due = clock.now() + UNPACED_GAP_MS;
        return;
      }
      due = remaining > RATE_LIMIT_RESERVE ? 0 : reset;
    },
  };
}
