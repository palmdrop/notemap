export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export type JsonSchema = JsonObject;

export type SchemaIssue = {
  readonly path: string;
  readonly keyword: string;
};
