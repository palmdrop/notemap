import { notThisItem, type Relay } from "@notemap/relay";

import type { Arena } from "./arena/read";
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

/**
 * Every watched channel, every poll. Nothing is remembered between runs: the
 * pool answers `already-captured` for what it has, which is what makes a full
 * scan the whole of the relay's correctness.
 *
 * A block that could not be relayed is logged and the scan of that channel
 * carries on. A channel that could not be *read* — are.na refused it, most
 * often a private channel the token lost access to — ends that channel and
 * lets the next one run: the other channels are other upstreams, and one
 * dead one should not stop the rest. A failure that was the *pool's* ends the
 * whole run instead, since every channel after it would fail the identical
 * way.
 */
export async function relayEverything(
  from: Arena,
  channels: readonly ChannelTarget[],
  log: Log,
  signal?: AbortSignal,
): Promise<readonly ChannelReport[]> {
  const reports: ChannelReport[] = [];

  for (const channel of channels) {
    const tally = zeroTally();
    let readFailed = false;

    try {
      for await (const block of from.contents(channel.handle, signal)) {
        tally.read += 1;

        try {
          const relaying = relayedFrom(block, from.open, channel.tags);
          if (relaying === undefined) {
            tally.empty += 1;
            continue;
          }

          const landed = await channel.relay.relay(relaying, signal);
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
    } catch (cause) {
      if (notThisItem(cause)) throw cause;
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
