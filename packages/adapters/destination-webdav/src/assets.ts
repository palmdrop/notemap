import type { DeliveredAsset } from "@notemap/core";
import { assetName } from "@notemap/output-markdown";

import type { Dav } from "./dav";
import { sibling, type Contained } from "./paths";

/**
 * What each asset would be called, keyed by slot. A name is its content's
 * digest and its uploaded filename, so it is arithmetic rather than a fact
 * about the server — which is what lets a note be rendered without anything
 * being uploaded. The naming is shared, so a webdav vault and a filesystem
 * vault call the same picture the same thing.
 */
export function assetNames(
  assets: readonly DeliveredAsset[],
): ReadonlyMap<string, string> {
  return new Map(assets.map((each) => [each.slot, nameOf(each)]));
}

/** Every asset put into the note's own collection under the name `assetNames` gives it. */
export async function placeAssets(
  dav: Dav,
  note: Contained,
  assets: readonly DeliveredAsset[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const placed = new Map<string, string>();

  for (const each of assets) {
    placed.set(each.slot, await place(dav, note, each, signal));
  }

  return placed;
}

function nameOf(asset: DeliveredAsset): string {
  return assetName(asset.asset.filename, asset.asset.blob, asset.asset.id);
}

async function place(
  dav: Dav,
  note: Contained,
  asset: DeliveredAsset,
  signal?: AbortSignal,
): Promise<string> {
  const name = nameOf(asset);

  // Handed to `fetch` as it is: the opener is lazy because a delivery may be
  // carrying an hour of audio, and buffering it here would give that up.
  await dav.create(
    sibling(note, name).encoded,
    await asset.open(signal),
    signal,
  );

  // A name that is taken is this asset already there — the name is its content's
  // digest, so whatever holds it is these bytes. That is what makes a retried
  // delivery land on the copy its last attempt wrote instead of beside it,
  // which is what `unreachable` promises when it says nothing was delivered.
  return name;
}
