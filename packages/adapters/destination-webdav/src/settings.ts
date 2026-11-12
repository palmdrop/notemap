import type {
  DestinationKindName,
  JsonObject,
  JsonSchema,
} from "@notemap/core";
import {
  FRONTMATTER,
  FRONTMATTER_SETTING,
  frontmatterSettingOf,
  HASHTAGS,
  HASHTAGS_SETTING,
  hashtagsSettingOf,
  type FrontmatterMode,
} from "@notemap/output-markdown";

export const WEBDAV = "webdav" as DestinationKindName;

/**
 * What a person fills in, and the whole of it. Neither field can name an
 * address or a secret: the account is the host's, declared in its config, and
 * this chooses one by name and a folder inside it.
 *
 * Account names are `examples` rather than an `enum`, which would constrain:
 * settings are re-validated on every describe, so a constraining list would
 * turn a destination `unusable` the moment an account is renamed in config.
 */
export function webdavSettings(accounts: readonly string[]): JsonSchema {
  return {
    type: "object",
    required: ["account", "root"],
    additionalProperties: false,
    properties: {
      account: {
        type: "string",
        minLength: 1,
        title: "Account",
        description:
          "The name of an account, set in settings or declared under `[[accounts]]` in the daemon's config. The address and the password are the account's, not this destination's.",
        ...(accounts.length === 0 ? {} : { examples: [...accounts] }),
      },
      root: {
        type: "string",
        title: "Folder",
        description:
          "The folder this destination is, under the account's own. Left blank, the destination is the account's folder itself.",
      },
      [FRONTMATTER]: FRONTMATTER_SETTING,
      [HASHTAGS]: HASHTAGS_SETTING,
    },
  };
}

export type WebdavSettings = {
  /** The name of an account the host resolves. */
  readonly account: string;
  /** The collection the destination *is*, relative to the account's. Empty is the account's own. */
  readonly root: string;
  /** Absent is `none`, and a capability's own argument overrides it. */
  readonly frontmatter?: FrontmatterMode;
  /** Absent is off, and a capability's own argument overrides it. */
  readonly hashtags?: boolean;
};

/** Read rather than cast: a schema that passed once is not a type, and a row holds JSON. */
export function asWebdavSettings(
  settings: JsonObject,
): WebdavSettings | undefined {
  const account = settings["account"];
  const root = settings["root"];

  if (typeof account !== "string" || account === "") return undefined;
  if (typeof root !== "string") return undefined;

  const frontmatter = frontmatterSettingOf(settings);
  if (settings[FRONTMATTER] !== undefined && frontmatter === undefined) {
    return undefined;
  }

  const hashtags = hashtagsSettingOf(settings);
  if (settings[HASHTAGS] !== undefined && hashtags === undefined) {
    return undefined;
  }

  return {
    account,
    root,
    ...(frontmatter === undefined ? {} : { frontmatter }),
    ...(hashtags === undefined ? {} : { hashtags }),
  };
}
