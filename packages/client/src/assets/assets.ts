import { answered } from "../api/http";
import type { AssetId } from "../api/types";
import { Unreachable, Unreadable } from "../errors";
import type { Sending } from "../outbox/handler";
import type { Operation, PendingOperation } from "../outbox/operations";

export function namedBy(operation: Operation): readonly AssetId[] {
  return "envelope" in operation
    ? operation.envelope.payload.assets.map((reference) => reference.asset)
    : [];
}

/**
 * What leaves with an operation: the assets it names that nothing still queued
 * names too. A capture and the edit of it hold the same bytes, and whichever
 * lands first would otherwise strand the other.
 */
export function releasedBy(
  operation: Operation,
  queued: readonly PendingOperation[],
): readonly AssetId[] {
  const claimed = new Set(queued.flatMap((held) => namedBy(held.operation)));
  return namedBy(operation).filter((asset) => !claimed.has(asset));
}

/**
 * The bytes go up before the envelope that names them. Both carry ids minted
 * before either was sent, so an upload the pool already holds answers with the
 * asset rather than a second one, and a failure between them retries the pair.
 */
export async function uploaded(
  sending: Sending,
  operation: Operation,
): Promise<void> {
  for (const asset of namedBy(operation)) {
    const file = await held(sending, asset);
    if (file === undefined) continue;

    await answered(
      sending.api.PUT("/v1/assets/{id}", {
        params: {
          path: { id: asset },
          header: {
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          },
        },
        headers: { "content-type": file.type || "application/octet-stream" },
        // The body is the bytes, raw. Serialising them would be the one thing
        // this route does not want.
        body: await bytes(asset, file),
        bodySerializer: (body: unknown) => body as BodyInit,
      }),
    );
  }
}

/**
 * A store that could not answer is a local hiccup, and the operation waits for
 * the next drain rather than being refused for something no pool ever said.
 */
async function held(
  sending: Sending,
  asset: AssetId,
): Promise<File | undefined> {
  try {
    return await sending.bytes(asset);
  } catch (cause) {
    throw new Unreachable(
      cause,
      "the bytes could not be read from this device; this will be tried again",
    );
  }
}

/**
 * Read here rather than streamed, so bytes the store cannot produce are told
 * from a pool that did not answer and are refused rather than retried forever.
 */
async function bytes(asset: AssetId, file: File): Promise<string> {
  try {
    return (await file.arrayBuffer()) as unknown as string;
  } catch (cause) {
    throw new Unreadable(`the bytes for ${asset}`, cause);
  }
}
