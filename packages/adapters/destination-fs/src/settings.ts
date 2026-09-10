import type {
  DestinationKindName,
  JsonObject,
  JsonSchema,
} from "@notemap/core";
import {
  FRONTMATTER,
  FRONTMATTER_SETTING,
  frontmatterSettingOf,
  TAGS,
  TAGS_SETTING,
  tagsSettingOf,
  type FrontmatterMode,
  type TagsMode,
} from "@notemap/output-markdown";

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
    [FRONTMATTER]: FRONTMATTER_SETTING,
    [TAGS]: TAGS_SETTING,
  },
};

export type FilesystemSettings = {
  /** The directory the destination *is*. */
  readonly root: string;
  /** Absent is `none`, and a capability's own argument overrides it. */
  readonly frontmatter?: FrontmatterMode;
  /** Absent is `frontmatter`, and a capability's own argument overrides it. */
  readonly tags?: TagsMode;
};

/** Read rather than cast: a schema that passed once is not a type, and a row holds JSON. */
export function asFilesystemSettings(
  settings: JsonObject,
): FilesystemSettings | undefined {
  const root = settings["root"];

  if (typeof root !== "string" || root === "") return undefined;

  const frontmatter = frontmatterSettingOf(settings);
  if (settings[FRONTMATTER] !== undefined && frontmatter === undefined) {
    return undefined;
  }

  const tags = tagsSettingOf(settings);
  if (settings[TAGS] !== undefined && tags === undefined) return undefined;

  return {
    root,
    ...(frontmatter === undefined ? {} : { frontmatter }),
    ...(tags === undefined ? {} : { tags }),
  };
}
