import type {
  Capability,
  CapabilityName,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";

export const CREATE_FILE = "create-file" as CapabilityName;
export const APPEND_TO_FILE = "append-to-file" as CapabilityName;
export const CREATE_OR_APPEND_FILE = "create-or-append-file" as CapabilityName;

export type CapabilitiesOptions = {
  readonly accepts: readonly PayloadTypeName[];
  /**
   * Whether the field naming the place carries `x-notemap-candidates`. A kind
   * that cannot enumerate what it holds says no, and the composer draws no
   * browse button for an answer it would refuse.
   */
  readonly browsable: boolean;
};

/** An absent or empty `directory` names the root itself; an absent `filename` is derived. */
function createFileArguments(browsable: boolean): JsonSchema {
  return {
    type: "object",
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

/**
 * One field for what the composer types as one line. A trailing `/` names a
 * folder and the filename is derived; anything else names the file. The slash
 * is what answers *is `drafts` a new folder or a new extensionless file* when
 * nothing is there to look at.
 */
function createOrAppendFileArguments(browsable: boolean): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      path: {
        type: "string",
        title: "place",
        description:
          "The note, relative to the vault's root. Ending in `/` names a folder, and the filename is derived.",
        ...(browsable ? { "x-notemap-candidates": true } : {}),
      },
      heading: {
        type: "string",
        minLength: 1,
        title: "under",
        description:
          "The heading to append under, where the note is already there. Left blank, the item is appended at the end of it.",
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
      name: CREATE_OR_APPEND_FILE,
      accepts,
      argumentsSchema: createOrAppendFileArguments(browsable),
    },
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

export type CreateOrAppendFileArguments = {
  /** Ending in `/`, or empty, names a folder; the filename is then derived. */
  readonly path: string;
  readonly heading?: string;
};

/** Read rather than cast: a schema that passed once is not a type, and a record holds JSON. */
export function asCreateFileArguments(
  args: JsonObject,
): CreateFileArguments | undefined {
  const directory = args["directory"];
  const filename = args["filename"];

  if (directory !== undefined && typeof directory !== "string") {
    return undefined;
  }
  if (filename !== undefined && typeof filename !== "string") return undefined;

  return {
    directory: directory ?? "",
    ...(filename === undefined ? {} : { filename }),
  };
}

export function asCreateOrAppendFileArguments(
  args: JsonObject,
): CreateOrAppendFileArguments | undefined {
  const path = args["path"];
  const heading = args["heading"];

  if (path !== undefined && typeof path !== "string") return undefined;
  if (heading !== undefined && typeof heading !== "string") return undefined;

  return { path: path ?? "", ...(heading === undefined ? {} : { heading }) };
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
