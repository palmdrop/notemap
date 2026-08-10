import type { Asset } from "./asset";
import type { Artifact } from "./enrichment";
import type { Timestamp } from "./ids";
import type { ItemRecord } from "./item";
import type { RoutingRecord } from "./routing";

/**
 * One item's complete durable state: everything a rebuild needs to restore it,
 * and nothing else.
 *
 * The item is an `ItemRecord` rather than an `Item` so that derived state has
 * no way in — `supersededBy` follows from the revision link and a mirror
 * carrying it could disagree with the chain it was rebuilt from.
 */
export type MirrorRecord = {
  readonly item: ItemRecord;
  /**
   * Every asset the payload's and the artifacts' references reach, resolved:
   * a reference names an id and a hash, and a rebuild needs the filename,
   * media type and size that only the asset store holds.
   */
  readonly assets: readonly Asset[];
  readonly artifacts: readonly Artifact[];
  readonly routing: readonly RoutingRecord[];
  /** Compared by verify, never restored. */
  readonly modifiedAt: Timestamp;
};
