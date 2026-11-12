import type { Batch } from "@notemap/client";

import { logHref } from "$components/log/href";

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
/** Every batch ever answered, so one let go of is never taken for a new one. */
const said = new Set<string>();
/** Batches made here that the pool has not answered yet. */
const waiting = new Set<string>();
/** How a reservation of a waiting batch ended, before the pool's answer said it was the batch's. */
const early = new Map<string, Ending>();

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
  return {
    ...resultOf(
      tally.batch.action,
      tally.name,
      tally.batch.outcomes ?? [],
      endings,
    ),
    href: logHref(undefined, undefined, undefined, tally.batch.id),
  };
}

/**
 * The batches this shell made, counted until every item in each has settled,
 * so a batch is said once rather than once per item.
 */
export const tallying = {
  /** A batch made here and sent, which the log may speak of before the pool answers. */
  sent(batch: string): void {
    if (!said.has(batch)) waiting.add(batch);
  },

  /**
   * A reservation the log says a batch made. One made by a batch of this
   * shell's is the batch's to say, even before the pool's answer arrives.
   */
  fired(record: string, batch: string): void {
    if (waiting.has(batch)) byRecord.set(record, batch);
  },

  /**
   * A batch the pool has answered. Answers its one notice at once where nothing
   * in it is left to wait for, and nothing where it was already said.
   */
  answered(batch: Batch, name: string | undefined): Raised | undefined {
    if (said.has(batch.id) || batch.outcomes === undefined) return undefined;
    said.add(batch.id);
    waiting.delete(batch.id);

    const endings = new Map<string, Ending | undefined>();
    for (const outcome of batch.outcomes) {
      if (outcome.outcome !== "reserved") continue;
      endings.set(outcome.record, early.get(outcome.record));
      early.delete(outcome.record);
      byRecord.set(outcome.record, batch.id);
    }
    const tally = { batch, name, endings };
    tallies.set(batch.id, tally);
    forget();
    return settled(tally);
  },

  knows(batch: string): boolean {
    return said.has(batch);
  },

  /** Whether a reservation a batch is counting has already ended. */
  over(record: string): boolean {
    const id = byRecord.get(record);
    return (
      id !== undefined && tallies.get(id)?.endings.get(record) !== undefined
    );
  },

  /** Whether this record is one a batch is counting, whose own notice it says instead. */
  counts(record: string): boolean {
    return byRecord.has(record);
  },

  /** A reservation ended. Answers the batch's notice once it was the last one. */
  ended(record: string, ending: Ending): Raised | undefined {
    const id = byRecord.get(record);
    if (id === undefined) return undefined;
    const tally = tallies.get(id);
    if (tally === undefined) {
      if (waiting.has(id)) early.set(record, ending);
      return undefined;
    }
    if (tally.endings.get(record) !== undefined) return undefined;
    tally.endings.set(record, ending);
    return settled(tally);
  },

  clear(): void {
    tallies.clear();
    byRecord.clear();
    said.clear();
    waiting.clear();
    early.clear();
  },
};
