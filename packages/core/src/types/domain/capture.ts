import type { ItemId, SourceId, TagName, Timestamp } from "./ids";
import type { Item } from "./item";
import type { Payload } from "./payload";
import type { SuppliedArguments } from "./template";

export type CaptureEnvelope = {
  /** Absent from a source that is re-read rather than replayed; core mints one. */
  readonly id?: ItemId;
  readonly source: SourceId;
  readonly sourceItemId: string;
  readonly capturedAt: Timestamp;
  /**
   * Minutes east of UTC at the moment of capture, DST included — `120` for a
   * Swedish summer evening. Optional, because a source-supplied capture has
   * none to give and neither does anything that is not a browser; where it is
   * absent the host's zone answers instead.
   */
  readonly utcOffset?: number;
  readonly payload: Payload;
  readonly tags?: readonly TagName[];
  /** Values for the asked arguments of the templates its trigger tags fire, by tag. */
  readonly arguments?: Readonly<Record<string, SuppliedArguments>>;
  /** The head of a line this source diverged from, which this capture continues. */
  readonly continues?: ItemId;
};

/**
 * What an edit carries, which is a capture's envelope less everything a
 * revision mints for itself: the id, the capture time and the tags it inherits.
 */
export type EditEnvelope = {
  readonly source: SourceId;
  readonly sourceItemId: string;
  readonly payload: Payload;
};

export type CaptureOutcome =
  | { readonly kind: "captured"; readonly item: Item }
  | {
      readonly kind: "already-captured";
      readonly item: Item;
      readonly matchedOn: "id" | "source";
    };
