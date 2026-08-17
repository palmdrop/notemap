import { join } from "node:path";

import type { DeliveredAsset } from "@notemap/core";

import { createFile } from "./atomic";
import { alternatives, oneSegment } from "./paths";

/**
 * Every asset written into `directory` under the name it was uploaded with, and
 * what each one ended up being called — keyed by slot, so a renderer can link
 * to it.
 *
 * A name that is taken is suffixed rather than overwritten, whether the file
 * that holds it came from this delivery or was already in the vault. Nothing
 * here replaces anything: the destination is somebody else's data.
 *
 * Nothing is opened where nothing is handed over, which is what the lazy opener
 * on a `DeliveredAsset` exists for.
 */
export async function placeAssets(
  directory: string,
  assets: readonly DeliveredAsset[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const placed = new Map<string, string>();
  const taken = new Set<string>();

  for (const each of assets) {
    placed.set(each.slot, await place(directory, each, taken, signal));
  }

  return placed;
}

async function place(
  directory: string,
  asset: DeliveredAsset,
  taken: Set<string>,
  signal?: AbortSignal,
): Promise<string> {
  const wanted = oneSegment(asset.asset.filename, asset.asset.id);

  for (const candidate of alternatives(wanted)) {
    if (taken.has(candidate)) continue;
    taken.add(candidate);

    try {
      await createFile(join(directory, candidate), await asset.open(signal));
      return candidate;
    } catch (cause) {
      // The name was already somebody else's. The stream was consumed getting
      // there, so the next candidate is opened afresh.
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    }
  }

  throw new Error(`every name near ${wanted} is taken in ${directory}`);
}
