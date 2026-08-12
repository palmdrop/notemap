import { createHash } from "node:crypto";

import { RefusedUpload } from "../errors/refused-upload";

export type UploadLimits = {
  readonly maxUploadBytes: number;
};

/**
 * The size limit is checked against the bytes as they arrive rather than against
 * `Content-Length`, which is a claim, and the digest at the end, before the blob
 * store renames anything into place — so a refused upload leaves no blob and no
 * asset.
 */
export async function* guarded(
  body: ReadableStream<Uint8Array> | null,
  max: number,
  claimed: string | undefined,
): AsyncGenerator<Uint8Array> {
  const digest = createHash("sha256");
  let size = 0;

  if (body !== null) {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        size += value.byteLength;
        if (size > max) {
          throw new RefusedUpload({ kind: "asset-too-large", max });
        }

        digest.update(value);
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  const actual = digest.digest("hex");
  if (claimed !== undefined && claimed !== actual) {
    throw new RefusedUpload({
      kind: "digest-mismatch",
      expected: claimed,
      actual,
    });
  }
}
