import type { Agent } from "./agent.js";
import type { ItemId, SuggestionId, TagName, Timestamp } from "./ids.js";
import type { DeliveryRequest } from "./routing.js";

export type Proposal =
  | { readonly kind: "tag"; readonly tag: TagName }
  | { readonly kind: "destination"; readonly delivery: DeliveryRequest };

/** Rejections are kept: they are the only signal separating a suggester that is wrong from one that is ignored. */
export type SuggestionDecision =
  | { readonly kind: "accepted"; readonly at: Timestamp }
  | { readonly kind: "rejected"; readonly at: Timestamp };

export type Suggestion = {
  readonly id: SuggestionId;
  readonly item: ItemId;
  readonly proposal: Proposal;
  readonly by: Agent;
  readonly createdAt: Timestamp;
  readonly decision?: SuggestionDecision;
};
