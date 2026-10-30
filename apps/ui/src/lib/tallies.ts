import type { Batch } from "@notemap/client";

import { resultOf, type Ending } from "./batching";
import type { Raised } from "./notices.svelte";

type Tally = {
  readonly batch: Batch;
  readonly name: string | undefined;
  /** By record, how each reservation ended, or nothing while it is open. */
  readonly endings: Map<string, Ending | undefined>;
};

/** Enough batches to stop a late entry being said on its own, and no memory of the session. */
const REMEMBERED = 50;

const tallies = new Map<string, Tally>();
const byRecord = new Map<string, string>();

function forget(): void {
  while (tallies.size > REMEMBERED) {
    const oldest = tallies.keys().next();
    if (oldest.done) return;
    const tally = tallies.get(oldest.value);
    for (const record of tally?.endings.keys() ?? []) byRecord.delete(record);
    tallies.delete(oldest.value);
  }
}

function settled(tally: Tally): Raised | undefined {
  const endings = [...tally.endings.values()];
  if (endings.some((one) => one === undefined)) return undefined;
  return resultOf(
    tally.batch.action,
    tally.name,
    tally.batch.outcomes ?? [],
    endings as Ending[],
  );
}

/**
 * The batches this shell made, counted until every item in each has settled,
 * so a batch is said once rather than once per item.
 */
export const tallying = {
  /**
   * A batch the pool has answered. Answers its one notice at once where nothing
   * in it is left to wait for, and nothing where it was already being counted.
   */
  answered(batch: Batch, name: string | undefined): Raised | undefined {
    if (tallies.has(batch.id) || batch.outcomes === undefined) return undefined;

    const endings = new Map<string, Ending | undefined>();
    for (const outcome of batch.outcomes) {
      if (outcome.outcome !== "reserved") continue;
      endings.set(outcome.record, undefined);
      byRecord.set(outcome.record, batch.id);
    }
    const tally = { batch, name, endings };
    tallies.set(batch.id, tally);
    forget();
    return settled(tally);
  },

  knows(batch: string): boolean {
    return tallies.has(batch);
  },

  /** Whether this record is one a batch is counting, whose own notice it says instead. */
  counts(record: string): boolean {
    return byRecord.has(record);
  },

  /** A reservation ended. Answers the batch's notice once it was the last one. */
  ended(record: string, ending: Ending): Raised | undefined {
    const id = byRecord.get(record);
    const tally = id === undefined ? undefined : tallies.get(id);
    if (tally === undefined || tally.endings.get(record) !== undefined) {
      return undefined;
    }
    tally.endings.set(record, ending);
    return settled(tally);
  },

  clear(): void {
    tallies.clear();
    byRecord.clear();
  },
};
