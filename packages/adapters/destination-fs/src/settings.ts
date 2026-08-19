import type {
  DestinationKindName,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";

export const FILESYSTEM = "filesystem" as DestinationKindName;

/**
 * What a person fills in, and the whole of it. The root is never created: one
 * that is not there is an unmounted drive far more often than it is a typo.
 */
export const FILESYSTEM_SETTINGS: JsonSchema = {
  type: "object",
  required: ["root"],
  additionalProperties: false,
  properties: {
    root: { type: "string", minLength: 1 },
    accepts: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};

export type FilesystemSettings = {
  /** The directory the destination *is*. */
  readonly root: string;
  /** Absent takes whatever the host said a folder can hold. */
  readonly accepts?: readonly PayloadTypeName[];
};

/** Read rather than cast: a schema that passed once is not a type, and a row holds JSON. */
export function asFilesystemSettings(
  settings: JsonObject,
): FilesystemSettings | undefined {
  const root = settings["root"];
  const accepts = settings["accepts"];

  if (typeof root !== "string" || root === "") return undefined;
  if (accepts === undefined) return { root };
  if (
    !Array.isArray(accepts) ||
    accepts.some((each) => typeof each !== "string")
  ) {
    return undefined;
  }

  return { root, accepts: accepts as readonly PayloadTypeName[] };
}
