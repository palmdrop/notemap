import type { Agent } from "./agent.js";
import type { ItemId, SourceId, TagName, Timestamp } from "./ids.js";
import type { Payload } from "./payload.js";

export type Tag = {
  readonly name: TagName;
  readonly by: Agent;
  readonly addedAt: Timestamp;
};

export type ArchiveState = {
  readonly archivedAt: Timestamp;
  readonly reason?: string;
};

export type Item = {
  readonly id: ItemId;
  readonly source: SourceId;
  readonly sourceItemId: string;
  readonly payload: Payload;
  readonly tags: readonly Tag[];

  /** Capture time, supplied by the source. Orders the feed and never changes. */
  readonly createdAt: Timestamp;

  /**
   * Revision or amendment time. Absent until the content is first changed;
   * the queue falls back to `createdAt` while it is.
   */
  readonly contentUpdatedAt?: Timestamp;

  /** Bumped by every change of any kind. Keys sync delta reads; orders nothing. */
  readonly modifiedAt: Timestamp;

  readonly revisionOf?: ItemId;

  /** Derived from another item's `revisionOf`, never stored. */
  readonly supersededBy?: ItemId;

  readonly archived?: ArchiveState;
};

/**
 * The caller asks to change content and does not assert headship; which of
 * these happened is core's answer, not the caller's instruction.
 */
export type EditOutcome =
  | { readonly kind: "amended"; readonly item: Item }
  | {
      readonly kind: "revised";
      readonly revision: Item;
      readonly supersedes: ItemId;
    };
