import type { ItemId, SourceId, TagName, Timestamp } from "./ids.js";
import type { Item } from "./item.js";
import type { Payload } from "./payload.js";

export type CaptureEnvelope = {
  /**
   * Supplied only by a source that can mint one and remember it across a
   * restart, which is what makes an offline client's replay idempotent. A
   * source that is re-read rather than replayed leaves this absent and is
   * identified by `source` and `sourceItemId`; core mints the id.
   */
  readonly id?: ItemId;

  readonly source: SourceId;
  readonly sourceItemId: string;
  readonly capturedAt: Timestamp;
  readonly payload: Payload;
  readonly tags?: readonly TagName[];
};

export type CaptureOutcome =
  | { readonly kind: "captured"; readonly item: Item }
  | {
      readonly kind: "already-captured";
      readonly item: Item;
      readonly matchedOn: "id" | "source";
    };
