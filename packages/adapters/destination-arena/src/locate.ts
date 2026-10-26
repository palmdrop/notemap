import type { Destination, LocateRequest, Presence } from "@notemap/core";

import type { Reach } from "./candidates";
import { asArenaArguments } from "./capabilities";
import { asArenaSettings } from "./settings";

/**
 * Whether each block the record names is still in the channel it was made in.
 * A record of several blocks made before they were kept names only the
 * channel, which says nothing about any one of them.
 */
export function arenaLocate(reach: Reach) {
  return async (
    destination: Destination,
    request: LocateRequest,
    signal?: AbortSignal,
  ): Promise<Presence> => {
    const settings = asArenaSettings(destination.settings);
    if (settings === undefined) {
      throw new Error(`${destination.name} has no readable arena settings`);
    }

    const channel = asArenaArguments(request.arguments)?.channel;
    if (channel === undefined) return { kind: "unknown" };

    const blocks = blocksOf(request, channel);
    if (blocks.length === 0) return { kind: "unknown" };

    const arena = await reach(settings.account);
    let found = 0;
    for (const block of blocks) {
      const connected = await arena.connections(block, signal);
      if (connected === undefined) continue;

      const inChannel = connected.channels.some(
        (each) => each.slug === channel || String(each.id) === channel,
      );
      if (inChannel) found += 1;
      // Only the first page was read, so a block in more channels than one
      // page holds may be in this one further on.
      else if (connected.more) return { kind: "unknown" };
    }

    return found === 0
      ? { kind: "absent" }
      : { kind: "present", found, of: blocks.length };
  };
}

function blocksOf(request: LocateRequest, channel: string): readonly number[] {
  const named =
    request.pointers ??
    (request.pointer === undefined || request.pointer === channel
      ? []
      : [request.pointer]);

  return named.every((one) => /^\d+$/.test(one)) ? named.map(Number) : [];
}
