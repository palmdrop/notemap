import type { Agent } from "./agent.js";
import type { ActionId, ItemId, JsonObject, Timestamp } from "./ids.js";

export type ActionKind =
  | "captured"
  | "amended"
  | "revised"
  | "tagged"
  | "untagged"
  | "suggestion-accepted"
  | "suggestion-rejected"
  | "artifact-added"
  | "artifact-corrected"
  | "archived"
  | "unarchived"
  | "routed"
  | "delivery-failed"
  | "enrichment-failed"
  | "enrichment-abandoned"
  | "purged";

/**
 * Written by the same command as the change it describes, so the two cannot
 * disagree. Read by humans tracing something; state is never derived from it.
 */
export type Action = {
  readonly id: ActionId;
  readonly kind: ActionKind;
  readonly subject: ItemId;
  readonly by: Agent;
  readonly at: Timestamp;
  readonly detail: JsonObject;
};
