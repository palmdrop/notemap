import { notThisItem, type Relay } from "@notemap/relay";

import { ArenaRateLimited, type Arena } from "./arena/read";
import { relayedFrom } from "./arena/relayed";
import type { WatchedChannel } from "./config/load";

/** Where a poll says what it did, and what it could not do. */
export type Log = {
  note(line: string): void;
  fault(line: string, cause?: unknown): void;
};

/** What one scan of one channel came to. */
export type Tally = {
  read: number;
  captured: number;
  unchanged: number;
  amended: number;
  revised: number;
  /** Blocks holding neither prose nor a file, or a channel-class block. */
  empty: number;
  failed: number;
};

function zeroTally(): Tally {
  return {
    read: 0,
    captured: 0,
    unchanged: 0,
    amended: 0,
    revised: 0,
    empty: 0,
    failed: 0,
  };
}

export type ChannelTarget = WatchedChannel & { readonly relay: Relay };

/** One channel's outcome: its tally, and whether the channel itself could be read at all. */
export type ChannelReport = {
  readonly source: string;
  readonly tally: Tally;
  readonly readFailed: boolean;
};

export type Scan = {
  /** Read every page, rather than stopping at the first page the pool knows. */
  readonly full: boolean;
  readonly signal?: AbortSignal;
};

/**
 * Every watched channel, newest connection first. Nothing is remembered
 * between runs: the pool answers `already-captured` for what it has, and the
 * first page holding such a block is where a scan that is not `full` stops —
 * everything below it was connected earlier and read by an earlier poll.
 *
 * A block that could not be relayed is logged and the scan of that channel
 * carries on. A channel that could not be *read* — are.na refused it, most
 * often a private channel the token lost access to — ends that channel and
 * lets the next one run: the other channels are other upstreams, and one
 * dead one should not stop the rest. A failure that was the *pool's*, or
 * are.na's rate limit, ends the whole run instead, since every channel after
 * it would fail the identical way.
 */
export async function relayEverything(
  from: Arena,
  channels: readonly ChannelTarget[],
  log: Log,
  { full, signal }: Scan,
): Promise<readonly ChannelReport[]> {
  const reports: ChannelReport[] = [];

  for (const channel of channels) {
    const tally = zeroTally();
    let readFailed = false;

    try {
      for await (const page of from.pages(channel.handle, signal)) {
        let known = false;

        for (const block of page) {
          tally.read += 1;

          try {
            const relaying = relayedFrom(block, from.open, channel.tags);
            if (relaying === undefined) {
              tally.empty += 1;
              continue;
            }

            const landed = await channel.relay.relay(relaying, signal);
            if (landed.kind !== "captured") known = true;

            if (landed.kind === "already-captured") tally.unchanged += 1;
            else if (landed.kind === "captured") tally.captured += 1;
            else if (landed.kind === "amended") tally.amended += 1;
            else tally.revised += 1;
          } catch (cause) {
            if (notThisItem(cause)) throw cause;
            tally.failed += 1;
            log.fault(
              `block ${String(block.id)} in ${channel.source} could not be relayed`,
              cause,
            );
          }
        }

        if (known && !full) break;
      }
    } catch (cause) {
      if (
        notThisItem(cause) ||
        cause instanceof ArenaRateLimited ||
        signal?.aborted === true
      ) {
        throw cause;
      }
      readFailed = true;
      log.fault(`${channel.source} could not be read`, cause);
    }

    reports.push({ source: channel.source, tally, readFailed });
  }

  return reports;
}

export function said(tally: Tally): string {
  return `read ${String(tally.read)}, captured ${String(tally.captured)}, unchanged ${String(tally.unchanged)}, amended ${String(tally.amended)}, revised ${String(tally.revised)}, empty ${String(tally.empty)}, failed ${String(tally.failed)}`;
}
