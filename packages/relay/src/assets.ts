import { v5 as uuidv5 } from "uuid";

import type { Pool } from "#pool/pool";
import type { Attachment } from "./types";

/**
 * Derived and never minted. A fresh id each poll would change the payload and
 * so manufacture a revision on every run, forever.
 *
 * Derived from the attachment's own identifier rather than from its bytes: two
 * names over one content are two assets, and upload compares the filename — so
 * the same picture arriving under two names would collide as
 * `409 asset-id-conflict` and the second one could never land.
 */
export function assetIdFor(namespace: string, attachment: Attachment): string {
  return uuidv5(attachment.id, namespace);
}

/** Every asset id the payload will name, in the order the attachments arrived. */
export async function place(
  pool: Pool,
  namespace: string,
  attachments: readonly Attachment[],
  signal?: AbortSignal,
): Promise<readonly { slot: string; asset: string }[]> {
  const placed: { slot: string; asset: string }[] = [];

  for (const [index, attachment] of attachments.entries()) {
    const asset = assetIdFor(namespace, attachment);

    // Asked before sending: unchanged bytes are re-read from upstream and put
    // over the wire once, not once per poll for as long as the relay runs.
    if ((await pool.asset(asset, signal)) === undefined) {
      await pool.upload(
        asset,
        {
          filename: attachment.filename,
          mime: attachment.mime,
          body: await attachment.open(signal),
        },
        signal,
      );
    }

    placed.push({ slot: slotFor(index), asset });
  }

  return placed;
}

/**
 * A zero-padded index, so slot order — which is the order a rendering draws in
 * — is the order the attachments arrived in upstream.
 */
function slotFor(index: number): string {
  return String(index).padStart(3, "0");
}
