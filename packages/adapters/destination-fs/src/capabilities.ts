import type {
  Capability,
  CapabilityName,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";

export const CREATE_FILE = "create-file" as CapabilityName;
export const APPEND_TO_FILE = "append-to-file" as CapabilityName;

/** An empty `directory` names the root itself; an absent `filename` is derived. */
const CREATE_FILE_TARGET: JsonSchema = {
  type: "object",
  required: ["directory"],
  additionalProperties: false,
  properties: {
    directory: { type: "string" },
    filename: { type: "string", minLength: 1 },
  },
};

/** `heading` absent appends at the end of the file. */
const APPEND_TO_FILE_TARGET: JsonSchema = {
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1 },
    heading: { type: "string", minLength: 1 },
  },
};

export function capabilitiesFor(
  accepts: readonly PayloadTypeName[],
): readonly Capability[] {
  return [
    { name: CREATE_FILE, accepts, targetSchema: CREATE_FILE_TARGET },
    { name: APPEND_TO_FILE, accepts, targetSchema: APPEND_TO_FILE_TARGET },
  ];
}

export type CreateFileTarget = {
  readonly directory: string;
  readonly filename?: string;
};

export type AppendToFileTarget = {
  readonly path: string;
  readonly heading?: string;
};

/** Read rather than cast: a schema that passed once is not a type, and a record holds JSON. */
export function asCreateFileTarget(
  target: JsonObject,
): CreateFileTarget | undefined {
  const directory = target["directory"];
  const filename = target["filename"];

  if (typeof directory !== "string") return undefined;
  if (filename !== undefined && typeof filename !== "string") return undefined;

  return { directory, ...(filename === undefined ? {} : { filename }) };
}

export function asAppendToFileTarget(
  target: JsonObject,
): AppendToFileTarget | undefined {
  const path = target["path"];
  const heading = target["heading"];

  if (typeof path !== "string" || path === "") return undefined;
  if (heading !== undefined && typeof heading !== "string") return undefined;

  return { path, ...(heading === undefined ? {} : { heading }) };
}
