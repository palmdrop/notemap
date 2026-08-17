import type {
  Capability,
  CapabilityName,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";

export const CREATE_FILE = "create-file" as CapabilityName;
export const APPEND_TO_FILE = "append-to-file" as CapabilityName;

/**
 * `directory` is required and may be empty, which names the destination root
 * itself. `filename` is optional because a person filing one item often wants
 * to name the note and a person clearing a queue does not; the adapter derives
 * one when it is absent.
 */
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

/**
 * Core validates a target against the schema above before any of this is
 * reached, and a job carrying one out reads it back from a record that was
 * validated then. These read it anyway rather than casting: what a record holds
 * is JSON, and a schema that once passed is not a type.
 */
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
