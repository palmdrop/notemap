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
  required: ["account", "root"],
  additionalProperties: false,
  properties: {
    account: {
      type: "string",
      minLength: 1,
      title: "Account",
      description:
        "The name of an account in the daemon's configuration, under `[[accounts]]`. The address and the password are the account's, not this destination's.",
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
  /** The name of an account the host resolves. */
  readonly account: string;
  /** The collection the destination *is*, relative to the account's. Empty is the account's own. */
  readonly root: string;
};

/** Read rather than cast: a schema that passed once is not a type, and a row holds JSON. */
export function asWebdavSettings(
  settings: JsonObject,
): WebdavSettings | undefined {
  const account = settings["account"];
  const root = settings["root"];

  if (typeof account !== "string" || account === "") return undefined;
  if (typeof root !== "string") return undefined;

  return { account, root };
}
