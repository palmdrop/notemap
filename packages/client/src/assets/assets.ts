import { answered } from "../api/http";
import type { AssetId } from "../api/types";
import type { Sending } from "../outbox/handler";
import type { Operation } from "../outbox/operations";

/** The assets an operation's envelope names, which is none for a kind with no envelope. */
export function namedBy(operation: Operation): readonly AssetId[] {
  return "envelope" in operation
    ? operation.envelope.payload.assets.map((reference) => reference.asset)
    : [];
}

/**
 * The assets an operation is the last claim on. A capture's bytes are its own,
 * and an `edit` names the ones the capture it revises brought — releasing those
 * would strand a capture that has not drained yet.
 */
export function claimedBy(operation: Operation): readonly AssetId[] {
  return operation.kind === "capture" ? namedBy(operation) : [];
}

/**
 * The bytes go up before the envelope that names them, for every asset the
 * store still holds. Both carry ids minted before either was sent, so an upload
 * the pool already has answers with the asset it holds rather than making a
 * second one — which is what lets a failure between the two retry the pair.
 */
export async function uploaded(
  sending: Sending,
  operation: Operation,
): Promise<void> {
  for (const asset of namedBy(operation)) {
    const file = await sending.bytes(asset);
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
        body: file as unknown as string,
        bodySerializer: (body: unknown) => body as BodyInit,
      }),
    );
  }
}
