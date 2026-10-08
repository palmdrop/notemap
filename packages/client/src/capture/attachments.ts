import type { AssetId, Item, Payload } from "#api/types";
import type { HeldBlob } from "../state/state";

/** What an item carries, as far as the pool or this client's own store can say. */
export type Attachment = {
  readonly asset: AssetId;
  /** The store's own bytes while it holds them, the pool's otherwise. */
  readonly url: string;
  readonly filename?: string;
  readonly mime?: string;
  readonly bytes?: number;
  /** A picture's as the pool measured it, which a client's own held bytes never are. */
  readonly dimensions?: { readonly width: number; readonly height: number };
};

function slotFor(index: number): string {
  return String(index).padStart(3, "0");
}

/**
 * Every asset an item names, in slot order. What the pool says an asset is
 * wins; what this client attached is the only answer there is until the
 * capture lands.
 */
export function attachmentsIn(
  item: Pick<Item, "payload" | "assets">,
  held: ReadonlyMap<AssetId, HeldBlob>,
  urlOf: (asset: AssetId) => string,
): readonly Attachment[] {
  return [...item.payload.assets]
    .sort((one, other) =>
      one.slot.localeCompare(other.slot, "en", { numeric: true }),
    )
    .map(({ asset }) => {
      const answered = item.assets?.find((each) => each.id === asset);
      const known = answered ?? held.get(asset);
      return {
        asset,
        url: urlOf(asset),
        ...(known?.filename === undefined ? {} : { filename: known.filename }),
        ...(known?.mime === undefined ? {} : { mime: known.mime }),
        ...(known?.bytes === undefined ? {} : { bytes: known.bytes }),
        ...(answered?.dimensions === undefined
          ? {}
          : { dimensions: answered.dimensions }),
      };
    });
}

/** The payload naming these assets, in this order, and nothing else. */
export function attached(
  payload: Payload,
  assets: readonly AssetId[],
): Payload {
  return {
    ...payload,
    assets: assets.map((asset, index) => ({ slot: slotFor(index), asset })),
  };
}
