import { join } from "node:path";

import type { DeliveredAsset } from "@notemap/core";

import { assetName } from "@notemap/output-markdown";

import { createFile } from "./atomic";

/**
 * Every asset written into `directory` under the name it was uploaded with and
 * its content's digest, and what each ended up called, keyed by slot.
 */
export async function placeAssets(
  directory: string,
  assets: readonly DeliveredAsset[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const placed = new Map<string, string>();

  for (const each of assets) {
    placed.set(each.slot, await place(directory, each, signal));
  }

  return placed;
}

async function place(
  directory: string,
  asset: DeliveredAsset,
  signal?: AbortSignal,
): Promise<string> {
  const name = assetName(
    asset.asset.filename,
    asset.asset.blob,
    asset.asset.id,
  );

  try {
    await createFile(join(directory, name), await asset.open(signal));
  } catch (cause) {
    // A name that is taken is this asset already there — the name is its
    // content's digest, so whatever holds it is these bytes. That is what lets
    // a delivery retried after a partial failure land on the copy it already
    // wrote instead of beside it.
    if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
  }

  return name;
}
