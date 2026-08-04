import type { Agent } from "./agent";
import type { ItemId, SuggestionId, TagName, Timestamp } from "./ids";
import type { DeliveryRequest } from "./routing";

export type Proposal =
  | { readonly kind: "tag"; readonly tag: TagName }
  | { readonly kind: "destination"; readonly delivery: DeliveryRequest };

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

export type SuggestionDraft = Omit<
  Suggestion,
  "id" | "by" | "createdAt" | "decision"
>;
