import type { JsonObject } from "../json";
import type {
  CapabilityName,
  DestinationId,
  RoutingTemplateId,
  TagName,
  Timestamp,
} from "./ids";

/**
 * What a template says about the folder its place sits in. `establish` is the
 * template's alone: it resolves to one of the other two when the decision is
 * made, so no adapter ever hears the word.
 */
export type FolderMode = "create" | "require" | "establish";

/** The namespace a trigger tag lives under, so a tag with an effect is recognisable as one. */
export const TRIGGER_TAG_NAMESPACE = "route/";

/** What core submits to be written. Excludes every field the store owns or derives. */
export type RoutingTemplateRecord = {
  readonly id: RoutingTemplateId;
  /** A person's label. Free text, and need not be unique: a record names the id. */
  readonly name: string;
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  /** Patterns until the decision is made, which is when core expands them. */
  readonly arguments: JsonObject;
  readonly folder: FolderMode;
  /** Declared rather than derived, so renaming disarms no tag already written. */
  readonly triggerTag?: TagName;
  /** When the first delivery from this template landed. Only `establish` reads it. */
  readonly establishedAt?: Timestamp;
  readonly createdAt: Timestamp;
};

/** How much of the pool this template made, derived from the records naming it. */
export type TemplateFirings = {
  readonly records: number;
  readonly lastAt?: Timestamp;
};

/** A record plus what the store derives from the rest of the pool around it. */
export type RoutingTemplate = RoutingTemplateRecord & {
  readonly modifiedAt: Timestamp;
  readonly fired: TemplateFirings;
};

/** What a person supplies to create one. The id and the timestamps are not theirs. */
export type RoutingTemplateDraft = {
  readonly name: string;
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly arguments: JsonObject;
  /** Absent is `create`, which is what every routing decision does today. */
  readonly folder?: FolderMode;
  readonly triggerTag?: TagName;
};

/** What a person may change afterwards, which is everything they supplied. */
export type RoutingTemplateChanges = {
  readonly name?: string;
  readonly destination?: DestinationId;
  readonly capability?: CapabilityName;
  readonly arguments?: JsonObject;
  readonly folder?: FolderMode;
  /** `null` takes the tag off; absent leaves it as it stands. */
  readonly triggerTag?: TagName | null;
};
