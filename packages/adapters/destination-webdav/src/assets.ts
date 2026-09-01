import type { DeliveredAsset } from "@notemap/core";
import { alternatives, oneSegment } from "@notemap/output-markdown";

import type { Dav } from "./dav";
import { Refused } from "./errors";
import { sibling, type Contained } from "./paths";

/**
 * Every asset put into the note's own collection under the name it was uploaded
 * with, and what each ended up called, keyed by slot. A name that is taken is
 * suffixed rather than overwritten, whoever took it — the shared naming, so a
 * webdav vault and a filesystem vault call the same picture the same thing.
 */
export async function placeAssets(
  dav: Dav,
  note: Contained,
  assets: readonly DeliveredAsset[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const placed = new Map<string, string>();
  const taken = new Set<string>();

  for (const each of assets) {
    placed.set(each.slot, await place(dav, note, each, taken, signal));
  }

  return placed;
}

async function place(
  dav: Dav,
  note: Contained,
  asset: DeliveredAsset,
  taken: Set<string>,
  signal?: AbortSignal,
): Promise<string> {
  const wanted = oneSegment(asset.asset.filename, asset.asset.id);

  for (const candidate of alternatives(wanted)) {
    if (taken.has(candidate)) continue;
    taken.add(candidate);

    // Handed to `fetch` as it is: the opener is lazy because a delivery may be
    // carrying an hour of audio, and buffering it here would give that up.
    const written = await dav.create(
      sibling(note, candidate).encoded,
      await asset.open(signal),
      signal,
    );
    // The name was already somebody else's. The stream was consumed getting
    // there, so the next candidate is opened afresh.
    if (written === "written") return candidate;
  }

  throw new Refused(
    `every name near ${wanted} is taken beside ${note.relative}`,
  );
}
