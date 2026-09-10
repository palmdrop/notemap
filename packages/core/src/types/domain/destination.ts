import type { JsonObject, JsonSchema, JsonValue } from "../json";
import type {
  CapabilityName,
  DestinationId,
  DestinationKindName,
  PayloadTypeName,
  Timestamp,
} from "./ids";

/** What core submits to be written. Excludes every field the store owns or derives. */
export type DestinationRecord = {
  readonly id: DestinationId;
  /** A person's label. Free text, and need not be unique: a record names the id. */
  readonly name: string;
  readonly kind: DestinationKindName;
  /** Opaque to core, which only checks it against the kind's schema. */
  readonly settings: JsonObject;
  /** Present means no longer offered for new routing. */
  readonly retiredAt?: Timestamp;
  readonly createdAt: Timestamp;
};

export type Destination = DestinationRecord & {
  readonly modifiedAt: Timestamp;
};

/** Core holds no list of kinds: it validates against whatever the port publishes. */
export type DestinationKind = {
  readonly name: DestinationKindName;
  readonly settingsSchema: JsonSchema;
};

export type Capability = {
  readonly name: CapabilityName;
  readonly accepts: readonly PayloadTypeName[];
  readonly argumentsSchema: JsonSchema;
};

export type DestinationDescriptor = {
  readonly capabilities: readonly Capability[];
};

/**
 * `undescribable` went and looked and could not say; `unusable` could not be
 * asked at all — nothing speaks its kind, or its settings no longer satisfy
 * that kind's schema.
 */
export type DestinationReport =
  | ({ readonly kind: "described" } & DestinationDescriptor)
  | { readonly kind: "undescribable"; readonly detail: string }
  | { readonly kind: "unusable"; readonly detail: string };

/**
 * What a destination is asked when a person is choosing what one field of one
 * capability's arguments should hold. `scope` is opaque to core: absent asks
 * at the top, and present is a scope an earlier answer minted, for a caller
 * descending without being told it is descending anything. Carries neither
 * the capability's other arguments nor the ones filled in so far — no field
 * either kind declares today depends on another.
 */
export type CandidatesRequest = {
  readonly capability: CapabilityName;
  readonly field: string;
  readonly scope?: string;
};

/**
 * One thing the field could hold, or one place to look for more, or both.
 * Both are optional because they are independent: a vault's folder is
 * somewhere an `append` browser descends and never something that field may
 * hold, and a note is the reverse. An entry with neither is nothing, and no
 * caller is obliged to draw one.
 */
export type CandidateEntry = {
  readonly label: string;
  /** Absent where this is only somewhere to look further. */
  readonly value?: JsonValue;
  /** Absent where the destination has nothing further to offer past this entry. */
  readonly scope?: string;
  /**
   * The same thing under a name that survives being renamed, where the
   * destination has two names for it — an are.na channel is `reading` today and
   * `12345` for as long as it exists. Absent where `value` is already the
   * lasting one, which is the ordinary case.
   *
   * What it is *for* is a decision that fires again: a routing template sits on
   * a tag for months, and a `value` that rots takes the template with it. A
   * decision made once prefers the readable form, so the two surfaces take
   * different halves of the same entry and neither has to know which kind it is
   * talking to.
   */
  readonly durable?: JsonValue;
};

export type CandidatesAnswer = {
  readonly entries: readonly CandidateEntry[];
  /** True where the destination held more than it answered. */
  readonly truncated: boolean;
};

/**
 * What a destination is asked when a surface already holds a value and needs
 * the name a person knows it by. `candidates` asks what a field could hold and
 * answers a page; this asks what one thing it holds is called and answers one
 * entry — a different question, because a page may be truncated and a name may
 * not, and because an account with more channels than a page is exactly where
 * the two come apart.
 *
 * `value` is the field's own string, in whichever of an entry's forms it ended
 * up holding: a decision made once keeps `value`, a template keeps `durable`,
 * and a destination that answers for one answers for both.
 */
export type NamingRequest = {
  readonly capability: CapabilityName;
  readonly field: string;
  readonly value: string;
};

/**
 * The entry that value names, where the destination has one. Absent is a true
 * answer rather than a failure: an answer is one page of what a destination
 * holds, and a place typed by hand names nothing in it.
 */
export type NamingAnswer = {
  readonly entry?: CandidateEntry;
};

/** `candidates`' failures, for the same reasons and sorted the same way. */
export type NamingReport =
  | ({ readonly kind: "answered" } & NamingAnswer)
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "unusable"; readonly detail: string }
  | { readonly kind: "not-offered" };

/**
 * `unreachable` went and asked and could not say; `unusable` could not be
 * asked at all, on the same terms as `DestinationReport`; `not-offered` is a
 * kind that does not do this, which is the same answer whether the adapter
 * says so or has simply never implemented the method.
 */
export type CandidatesReport =
  | ({ readonly kind: "answered" } & CandidatesAnswer)
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "unusable"; readonly detail: string }
  | { readonly kind: "not-offered" };

/**
 * Whether a destination is really there, having been asked. `ready` is not a
 * promise that a write will land: nothing writes to find out.
 */
export type DestinationProbe =
  | { readonly kind: "ready" }
  | { readonly kind: "rejected"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "unusable"; readonly detail: string }
  | { readonly kind: "not-offered" };

/** What a person supplies to create one. The id, the timestamps and retirement are not theirs. */
export type DestinationDraft = {
  readonly name: string;
  readonly kind: DestinationKindName;
  readonly settings: JsonObject;
};

/** What a person may change afterwards. The kind is not among them. */
export type DestinationChanges = {
  readonly name?: string;
  readonly settings?: JsonObject;
};
