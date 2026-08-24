import type { CaptureEnvelope, Item } from "../api/types";
import type { CaptureInput } from "../types";

const TEXT = "text";
const IMAGE = "image";
/** The slot `image` captures declare required, per the example config. */
const SLOT = "image";

/**
 * A client that mints at the moment of capture has one answer for both
 * identities, so the id it minted is also the source's own id for it.
 */
export function envelopeFor(
  input: CaptureInput,
  id: string,
  at: string,
): CaptureEnvelope {
  const asset = input.asset;

  const body =
    asset === undefined
      ? { type: TEXT, content: { text: input.text } }
      : {
          type: IMAGE,
          content: input.text.trim() === "" ? {} : { caption: input.text },
        };

  return {
    id,
    source: input.channel,
    sourceItemId: id,
    capturedAt: at,
    payload: {
      ...body,
      metadata: {},
      assets: asset === undefined ? [] : [{ slot: SLOT, asset }],
    },
  };
}

export function optimisticItem(envelope: CaptureEnvelope): Item {
  return {
    id: envelope.id,
    source: envelope.source,
    sourceItemId: envelope.sourceItemId,
    payload: envelope.payload,
    tags: [],
    createdAt: envelope.capturedAt,
    modifiedAt: envelope.capturedAt,
    revisedInto: [],
  };
}
