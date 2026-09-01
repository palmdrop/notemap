import type {
  DestinationKindName,
  JsonObject,
  JsonSchema,
} from "@notemap/core";

export const WEBDAV = "webdav" as DestinationKindName;

/**
 * What a person fills in, and the whole of it. Neither field can name an
 * address or a secret: the account is the host's, declared in its config, and
 * this chooses one by name and a folder inside it.
 */
export const WEBDAV_SETTINGS: JsonSchema = {
  type: "object",
  required: ["profile", "root"],
  additionalProperties: false,
  properties: {
    profile: {
      type: "string",
      minLength: 1,
      title: "Account",
      description:
        "The name of an account in the daemon's configuration. The address and the password are its, not this destination's.",
    },
    root: {
      type: "string",
      title: "Folder",
      description:
        "The folder this destination is, under the account's own. Left blank, the destination is the account's folder itself.",
    },
  },
};

export type WebdavSettings = {
  /** The name of a credential profile the host resolves. */
  readonly profile: string;
  /** The collection the destination *is*, relative to the profile's. Empty is the profile's own. */
  readonly root: string;
};

/** Read rather than cast: a schema that passed once is not a type, and a row holds JSON. */
export function asWebdavSettings(
  settings: JsonObject,
): WebdavSettings | undefined {
  const profile = settings["profile"];
  const root = settings["root"];

  if (typeof profile !== "string" || profile === "") return undefined;
  if (typeof root !== "string") return undefined;

  return { profile, root };
}
