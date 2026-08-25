import type { AssetId } from "../api/types";

/**
 * The object URLs an adapter has handed out for blobs it holds. One per asset,
 * so a surface asking twice draws the same URL, and revoked when the bytes go.
 */
export function localUrls() {
  const held = new Map<AssetId, string>();

  return {
    /** The URL for these bytes, minted once. Absent bytes have no URL. */
    of(asset: AssetId, blob: Blob | undefined): string | undefined {
      const already = held.get(asset);
      if (already !== undefined) return already;
      if (blob === undefined) return undefined;

      const url = URL.createObjectURL(blob);
      held.set(asset, url);
      return url;
    },

    release(asset: AssetId): void {
      const url = held.get(asset);
      if (url === undefined) return;

      URL.revokeObjectURL(url);
      held.delete(asset);
    },
  };
}
