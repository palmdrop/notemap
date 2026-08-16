import { baseUrl } from "./client";
import { readError } from "./errors";
import type { Asset, Item } from "./types";

const IMAGE = "image";

/**
 * The bytes go up in their own request, and only a `201` is followed by a
 * capture: two requests where there was one, and the second must not fire if
 * the first failed.
 */
export async function upload(file: File): Promise<Asset> {
  const response = await fetch(`${baseUrl}/v1/assets`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
    body: file,
  });

  const body: unknown = await response.json();
  if (response.status !== 201) throw new Error(readError(body));
  return body as Asset;
}

/** Full size: a thumbnail endpoint is deliberately not built. */
export function assetContent(asset: string): string {
  return `${baseUrl}/v1/assets/${encodeURIComponent(asset)}/content`;
}

/** Only `image` captures: another payload type's slot may hold anything at all. */
export function imagesIn(item: Item): readonly string[] {
  return item.payload.type === IMAGE
    ? item.payload.assets.map((reference) => assetContent(reference.asset))
    : [];
}
