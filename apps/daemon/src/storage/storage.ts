import { stat } from "node:fs/promises";
import { dirname } from "node:path";

import type { Clock, Pool, ReclaimOutcome } from "@notemap/core";

import { freeAt } from "./free";
import type { Measurement, StorageReport } from "./types";

export type StorageConfig = {
  /** The SQLite file the pool lives in; the space free beside it is the directory's. */
  readonly pool: string;
  readonly assets: string;
  /** Absent is a daemon with no mirror. */
  readonly mirror?: string;
  /** The daemon's own database. Absent is one that holds none. */
  readonly auth?: string;
  /** What this daemon says it is deployed as. Absent claims nothing. */
  readonly deployment?: string;
  /** The host's own, so a measurement is stamped on the same timeline as everything else. */
  readonly clock: Clock;
};

export type Storage = {
  /** The live facts, and the last measurement if one was ever taken. Walks nothing. */
  read(): Promise<StorageReport>;
  /** Walks, joining one already in flight rather than starting a second. */
  measure(): Promise<StorageReport>;
  /** Takes every blob nothing names past the grace window, and answers what it took. */
  reclaim(): Promise<ReclaimOutcome>;
  /** Lets go of a measurement where it stands. */
  stop(): void;
};

/**
 * The expensive half is measured on request and remembered here, in memory, so
 * a restart forgets it — which is honest: a figure from before a restart is a
 * figure from before whatever the restart changed.
 *
 * The reclaim is handed in rather than taken off the pool, so the one a person
 * fires is the one the daemon already runs on its own interval: two at once
 * join, instead of walking the same store twice.
 */
export function createStorage(
  pool: Pool,
  config: StorageConfig,
  reclaim: () => Promise<ReclaimOutcome>,
): Storage {
  const { clock } = config;
  const stopping = new AbortController();

  let measured: Measurement | undefined;
  let inFlight: Promise<Measurement> | undefined;

  async function live(): Promise<StorageReport> {
    const [recorded, poolFree, assetsFree, mirrorFree, auth] =
      await Promise.all([
        pool.storage.recorded(),
        freeAt(dirname(config.pool)),
        freeAt(config.assets),
        config.mirror === undefined ? undefined : freeAt(config.mirror),
        bytesOf(config.auth),
      ]);

    return {
      pool: { path: config.pool, ...recorded.store, ...maybeFree(poolFree) },
      assets: {
        path: config.assets,
        ...recorded.assets,
        ...maybeFree(assetsFree),
      },
      ...(config.mirror === undefined
        ? {}
        : { mirror: { path: config.mirror, ...maybeFree(mirrorFree) } }),
      ...(config.auth === undefined || auth === undefined
        ? {}
        : { auth: { path: config.auth, bytes: auth } }),
      ...(config.deployment === undefined
        ? {}
        : { deployment: config.deployment }),
      ...(measured === undefined ? {} : { measured }),
    };
  }

  function walk(): Promise<Measurement> {
    inFlight ??= pool.storage
      .measure(stopping.signal)
      .then((storage) => {
        measured = { ...storage, at: clock.now() };
        return measured;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  return {
    read: live,
    measure: async () => {
      await walk();
      return live();
    },
    reclaim,
    stop: () => stopping.abort(),
  };
}

function maybeFree(free: number | undefined): { free?: number } {
  return free === undefined ? {} : { free };
}

/** A database the daemon has not written yet takes nothing a person can see. */
async function bytesOf(file: string | undefined): Promise<number | undefined> {
  if (file === undefined) return undefined;
  try {
    return (await stat(file)).size;
  } catch {
    return undefined;
  }
}
