import type { CaptureEnvelope, Item } from "#api/types";
import type { CaptureInput } from "../types";
import { attached } from "./attachments";

const NOTE = "note";

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
  const said = input.text.trim() === "" ? {} : { text: input.text };
  const tags = input.tags ?? [];

  return {
    id,
    source: input.channel,
    sourceItemId: id,
    capturedAt: at,
    ...(utcOffset === undefined ? {} : { utcOffset }),
    ...(tags.length === 0 ? {} : { tags: [...tags] }),
    payload: attached(
      { type: NOTE, content: said, metadata: {}, assets: [] },
      input.assets ?? [],
    ),
  };
}

export function optimisticItem(envelope: CaptureEnvelope): Item {
  return {
    id: envelope.id,
    source: envelope.source,
    sourceItemId: envelope.sourceItemId,
    payload: envelope.payload,
    tags: (envelope.tags ?? []).map((name) => ({
      name,
      by: { kind: "source", source: envelope.source },
      addedAt: envelope.capturedAt,
    })),
    createdAt: envelope.capturedAt,
    ...(envelope.utcOffset === undefined
      ? {}
      : { utcOffset: envelope.utcOffset }),
    modifiedAt: envelope.capturedAt,
    revisedInto: [],
  };
}
