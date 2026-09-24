import type { JsonObject } from "../json";
import type { Agent } from "./agent";
import type { ActionId, ItemId, Timestamp } from "./ids";

export const ACTION_KINDS = [
  "captured",
  "amended",
  "revised",
  "tagged",
  "untagged",
  "suggestion-added",
  "suggestion-accepted",
  "suggestion-rejected",
  "artifact-added",
  "artifact-corrected",
  "archived",
  "unarchived",
  "routed",
  "delivery-failed",
  "delivery-cancelled",
  "destination-created",
  "destination-renamed",
  "destination-reconfigured",
  "destination-retired",
  "destination-unretired",
  "destination-deleted",
  "template-created",
  "template-edited",
  "template-deleted",
  "template-fired",
  "pool-setting-changed",
  "enrichment-requested",
  "work-failed",
  "work-abandoned",
  "assets-released",
  "purged",
  "actions-cleared",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export type Action = {
  readonly id: ActionId;
  readonly kind: ActionKind;
  /** Absent for work that is not about an item — a destination names itself in `detail`. */
  readonly subject?: ItemId;
  readonly by: Agent;
  readonly at: Timestamp;
  readonly detail: JsonObject;
};

export type ActionQuery = {
  readonly item?: ItemId;
  /** Any of these kinds; absent or empty reads them all. */
  readonly kinds?: readonly ActionKind[];
};
