import type {
  Capability,
  CapabilityName,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";

export const CREATE_FILE = "create-file" as CapabilityName;
export const APPEND_TO_FILE = "append-to-file" as CapabilityName;

export type CapabilitiesOptions = {
  readonly accepts: readonly PayloadTypeName[];
  /**
   * Whether the field naming the place carries `x-notemap-candidates`. A kind
   * that cannot enumerate what it holds says no, and the composer draws no
   * browse button for an answer it would refuse.
   */
  readonly browsable: boolean;
};

/** An empty `directory` names the root itself; an absent `filename` is derived. */
function createFileArguments(browsable: boolean): JsonSchema {
  return {
    type: "object",
    required: ["directory"],
    additionalProperties: false,
    properties: {
      directory: {
        type: "string",
        title: "Folder",
        description: "Where the note is created, relative to the vault's root.",
        ...(browsable ? { "x-notemap-candidates": true } : {}),
      },
      filename: {
        type: "string",
        minLength: 1,
        title: "Filename",
        description:
          "The note's filename. Left blank, one is derived from the item.",
      },
    },
  };
}

/** `heading` absent appends at the end of the file. */
function appendToFileArguments(browsable: boolean): JsonSchema {
  return {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: {
      path: {
        type: "string",
        minLength: 1,
        title: "Note",
        description:
          "The note to append to, relative to the vault's root. Created if it does not exist.",
        ...(browsable ? { "x-notemap-candidates": true } : {}),
      },
      heading: {
        type: "string",
        minLength: 1,
        title: "Heading",
        description:
          "The heading to append under. Left blank, the item is appended at the end of the note.",
      },
    },
  };
}

export function capabilitiesFor({
  accepts,
  browsable,
}: CapabilitiesOptions): readonly Capability[] {
  return [
    {
      name: CREATE_FILE,
      accepts,
      argumentsSchema: createFileArguments(browsable),
    },
    {
      name: APPEND_TO_FILE,
      accepts,
      argumentsSchema: appendToFileArguments(browsable),
    },
  ];
}

export type CreateFileArguments = {
  readonly directory: string;
  readonly filename?: string;
};

export type AppendToFileArguments = {
  readonly path: string;
  readonly heading?: string;
};

/** Read rather than cast: a schema that passed once is not a type, and a record holds JSON. */
export function asCreateFileArguments(
  args: JsonObject,
): CreateFileArguments | undefined {
  const directory = args["directory"];
  const filename = args["filename"];

  if (typeof directory !== "string") return undefined;
  if (filename !== undefined && typeof filename !== "string") return undefined;

  return { directory, ...(filename === undefined ? {} : { filename }) };
}

export function asAppendToFileArguments(
  args: JsonObject,
): AppendToFileArguments | undefined {
  const path = args["path"];
  const heading = args["heading"];

  if (typeof path !== "string" || path === "") return undefined;
  if (heading !== undefined && typeof heading !== "string") return undefined;

  return { path, ...(heading === undefined ? {} : { heading }) };
}
