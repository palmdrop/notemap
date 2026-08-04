import type { ItemId, SourceId, TagName, Timestamp } from "./ids";
import type { Item } from "./item";
import type { Payload } from "./payload";

export type CaptureEnvelope = {
  /** Absent from a source that is re-read rather than replayed; core mints one. */
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
