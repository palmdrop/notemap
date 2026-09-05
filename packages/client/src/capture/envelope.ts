import type { CaptureEnvelope, Item } from "#api/types";
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
  /**
   * Minutes east of UTC, from the browser that captured it. Carried in the
   * outbox, so a capture made offline and drained tomorrow still says which day
   * it was made on.
   */
  utcOffset?: number,
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
    ...(utcOffset === undefined ? {} : { utcOffset }),
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
    ...(envelope.utcOffset === undefined
      ? {}
      : { utcOffset: envelope.utcOffset }),
    modifiedAt: envelope.capturedAt,
    revisedInto: [],
  };
}
