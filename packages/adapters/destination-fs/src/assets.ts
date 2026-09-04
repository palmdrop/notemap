import { join } from "node:path";

import type { DeliveredAsset } from "@notemap/core";

import { assetName } from "@notemap/output-markdown";

import { createFile } from "./atomic";

/** A name is arithmetic on the content and the filename, so a note can be rendered before anything is written. */
export function assetNames(
  assets: readonly DeliveredAsset[],
): ReadonlyMap<string, string> {
  return new Map(assets.map((each) => [each.slot, nameOf(each)]));
}

/** Every asset written into `directory` under the name `assetNames` gives it. */
export async function placeAssets(
  directory: string,
  assets: readonly DeliveredAsset[],
  signal?: AbortSignal,
): Promise<void> {
  for (const each of assets) await place(directory, each, signal);
}

function nameOf(asset: DeliveredAsset): string {
  return assetName(asset.asset.filename, asset.asset.blob, asset.asset.id);
}

async function place(
  directory: string,
  asset: DeliveredAsset,
  signal?: AbortSignal,
): Promise<void> {
  const name = nameOf(asset);

  try {
    await createFile(join(directory, name), await asset.open(signal));
  } catch (cause) {
    // A name that is taken is this asset already there — the name is its
    // content's digest, so whatever holds it is these bytes. That is what lets
    // a delivery retried after a partial failure land on the copy it already
    // wrote instead of beside it.
    if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
  }
}
