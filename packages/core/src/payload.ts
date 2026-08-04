import type { AssetRef } from "./asset.js";
import type { JsonObject, JsonSchema, PayloadTypeName } from "./ids.js";

/**
 * `content` is never parsed by core. Everything core needs to know about a
 * payload — which assets it holds — is declared in `assets` instead.
 */
export type Payload = {
  readonly type: PayloadTypeName;
  readonly content: JsonObject;
  readonly metadata: JsonObject;
  readonly assets: readonly AssetRef[];
};

export type PayloadTypeDescriptor = {
  readonly name: PayloadTypeName;
  readonly contentSchema: JsonSchema;
  readonly requiredSlots: readonly string[];
};
