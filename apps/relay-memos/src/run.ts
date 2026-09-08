import { notThisItem, type Relay } from "@notemap/relay";

import { relayedFrom } from "./memos/relayed";
import type { Memos } from "./memos/read";

/** Where a poll says what it did, and what it could not do. */
export type Log = {
  note(line: string): void;
  fault(line: string, cause?: unknown): void;
};

/** What one scan of everything upstream came to. */
export type Tally = {
  read: number;
  captured: number;
  unchanged: number;
  amended: number;
  revised: number;
  /** Memos holding neither prose nor an attachment, which are not captured. */
  empty: number;
  failed: number;
};

/**
 * Every memo, every poll. Nothing is remembered between runs: the pool answers
 * `already-captured` for what it has, which is what makes a full scan the whole
 * of the relay's correctness.
 *
 * A memo that could not be relayed is logged and the scan carries on. The
 * recovery strategy is the next poll, and a memo the pool never took is a memo
 * still upstream to be read again. A failure that was the *pool's* ends the
 * scan instead: every memo after it would fail the same way, and a thousand
 * copies of one line is not a thousand things to know.
 */
export async function relayEverything(
  from: Memos,
  into: Relay,
  log: Log,
  signal?: AbortSignal,
): Promise<Tally> {
  const tally: Tally = {
    read: 0,
    captured: 0,
    unchanged: 0,
    amended: 0,
    revised: 0,
    empty: 0,
    failed: 0,
  };

  for await (const memo of from.mine(signal)) {
    tally.read += 1;

    try {
      const relaying = relayedFrom(memo, from.open);
      if (relaying === undefined) {
        tally.empty += 1;
        continue;
      }

      const landed = await into.relay(relaying, signal);
      if (landed.kind === "already-captured") tally.unchanged += 1;
      else if (landed.kind === "captured") tally.captured += 1;
      else if (landed.kind === "amended") tally.amended += 1;
      else tally.revised += 1;
    } catch (cause) {
      if (notThisItem(cause)) throw cause;
      tally.failed += 1;
      log.fault(`${memo.name} could not be relayed`, cause);
    }
  }

  return tally;
}

export function said(tally: Tally): string {
  return `read ${String(tally.read)}, captured ${String(tally.captured)}, unchanged ${String(tally.unchanged)}, amended ${String(tally.amended)}, revised ${String(tally.revised)}, empty ${String(tally.empty)}, failed ${String(tally.failed)}`;
}
