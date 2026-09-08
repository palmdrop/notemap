import { ASKABLE_FIELD, FOLDER_ARGUMENT, PATH_FIELD } from "@notemap/core";
import type {
  Capability,
  CapabilityName,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";

import { FRONTMATTER, FRONTMATTER_MODE } from "./frontmatter";

export const CREATE = "create" as CapabilityName;
export const APPEND = "append" as CapabilityName;
export const CREATE_OR_APPEND = "create-or-append" as CapabilityName;

export type CapabilitiesOptions = {
  readonly accepts: readonly PayloadTypeName[];
  /**
   * Whether the field naming the place carries `ASKABLE_FIELD`. A kind
   * that cannot enumerate what it holds says no, and the composer draws no
   * browse button for an answer it would refuse.
   */
  readonly browsable: boolean;
};

/**
 * Whether a folder that is not there is made or refused. Orthogonal to what the
 * capability does, so it is the same field on all three: the outcome a person
 * wants is a note in a folder either way, and this is a condition about the
 * world rather than a fourth outcome.
 *
 * `create` is the default, so every decision made before this existed is
 * unchanged. A template's `establish` never reaches here — it resolves to one
 * of these two when the decision is made.
 *
 * The field this is *about* is marked with `PATH_FIELD` below, so whatever has
 * to check a folder reads which one it is rather than knowing these three
 * capabilities by name.
 */
const FOLDER_MODE = {
  type: "string",
  enum: ["create", "require"],
  default: "create",
  title: "folder",
  description:
    "Whether a folder that is not there is made, or the delivery refused.",
} as const;

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
        [PATH_FIELD]: true,
        ...(browsable ? { [ASKABLE_FIELD]: true } : {}),
      },
      filename: {
        type: "string",
        minLength: 1,
        title: "Filename",
        description:
          "The note's filename. Left blank, one is derived from the item.",
      },
      [FOLDER_ARGUMENT]: FOLDER_MODE,
      [FRONTMATTER]: FRONTMATTER_MODE,
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
        [PATH_FIELD]: true,
        ...(browsable ? { [ASKABLE_FIELD]: true } : {}),
      },
      heading: {
        type: "string",
        minLength: 1,
        title: "Heading",
        description:
          "The heading to append under. Left blank, the item is appended at the end of the note.",
      },
      [FOLDER_ARGUMENT]: FOLDER_MODE,
      [FRONTMATTER]: FRONTMATTER_MODE,
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
        [PATH_FIELD]: true,
        ...(browsable ? { [ASKABLE_FIELD]: true } : {}),
      },
      heading: {
        type: "string",
        minLength: 1,
        title: "under",
        description:
          "The heading to append under, where the note is already there. Left blank, the item is appended at the end of it.",
      },
      [FOLDER_ARGUMENT]: FOLDER_MODE,
      [FRONTMATTER]: FRONTMATTER_MODE,
    },
  };
}

export function capabilitiesFor({
  accepts,
  browsable,
}: CapabilitiesOptions): readonly Capability[] {
  return [
    {
      name: CREATE_OR_APPEND,
      accepts,
      argumentsSchema: createOrAppendFileArguments(browsable),
    },
    {
      name: CREATE,
      accepts,
      argumentsSchema: createFileArguments(browsable),
    },
    {
      name: APPEND,
      accepts,
      argumentsSchema: appendToFileArguments(browsable),
    },
  ];
}

/** The two values that reach an adapter. `establish` is the template's alone. */
export type FolderMode = "create" | "require";

export type CreateFileArguments = {
  readonly directory: string;
  readonly filename?: string;
  readonly folder: FolderMode;
};

export type AppendToFileArguments = {
  readonly path: string;
  readonly heading?: string;
  readonly folder: FolderMode;
};

export type CreateOrAppendFileArguments = {
  /** Ending in `/`, or empty, names a folder; the filename is then derived. */
  readonly path: string;
  readonly heading?: string;
  readonly folder: FolderMode;
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

  const folder = folderModeOf(args);
  if (folder === undefined) return undefined;

  return {
    directory: directory ?? "",
    ...(filename === undefined ? {} : { filename }),
    folder,
  };
}

/** Absent is `create`, which is what every file-writing capability did before this. */
export function folderModeOf(args: JsonObject): FolderMode | undefined {
  const folder = args[FOLDER_ARGUMENT];
  if (folder === undefined) return "create";
  return folder === "create" || folder === "require" ? folder : undefined;
}

export function asCreateOrAppendFileArguments(
  args: JsonObject,
): CreateOrAppendFileArguments | undefined {
  const path = args["path"];
  const heading = args["heading"];

  if (path !== undefined && typeof path !== "string") return undefined;
  if (heading !== undefined && typeof heading !== "string") return undefined;

  const folder = folderModeOf(args);
  if (folder === undefined) return undefined;

  return {
    path: path ?? "",
    ...(heading === undefined ? {} : { heading }),
    folder,
  };
}

export function asAppendToFileArguments(
  args: JsonObject,
): AppendToFileArguments | undefined {
  const path = args["path"];
  const heading = args["heading"];

  if (typeof path !== "string" || path === "") return undefined;
  if (heading !== undefined && typeof heading !== "string") return undefined;

  const folder = folderModeOf(args);
  if (folder === undefined) return undefined;

  return { path, ...(heading === undefined ? {} : { heading }), folder };
}
