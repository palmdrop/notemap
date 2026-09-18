import type { AssetId, Item, Payload } from "#api/types";

/** The one slot a shell's picture goes in, on capture and on edit alike. */
export const SLOT = "image";

export type Picture = {
  readonly asset: AssetId;
  readonly filename?: string;
  readonly mime?: string;
};

/** The picture an item carries in the shell's slot, as far as the item can say what it is. */
export function pictureIn(item: Item): Picture | undefined {
  const reference = item.payload.assets.find((each) => each.slot === SLOT);
  if (reference === undefined) return undefined;

  const asset = item.assets?.find((each) => each.id === reference.asset);
  return {
    asset: reference.asset,
    ...(asset === undefined
      ? {}
      : { filename: asset.filename, mime: asset.mime }),
  };
}

/** The payload with this picture in the slot, or the slot emptied. Other slots stay as they were. */
export function pictured(
  payload: Payload,
  asset: AssetId | undefined,
): Payload {
  const others = payload.assets.filter((each) => each.slot !== SLOT);
  return {
    ...payload,
    assets: asset === undefined ? others : [...others, { slot: SLOT, asset }],
  };
}
