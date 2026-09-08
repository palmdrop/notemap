import type { JsonObject, JsonSchema } from "../json";
import type { AssetRef } from "./asset";
import type { PayloadTypeName } from "./ids";

export type Payload = {
  readonly type: PayloadTypeName;
  readonly content: JsonObject;
  readonly metadata: JsonObject;
  readonly assets: readonly AssetRef[];
};

export type PayloadTypeDescriptor = {
  readonly name: PayloadTypeName;
  readonly contentSchema: JsonSchema;
};
