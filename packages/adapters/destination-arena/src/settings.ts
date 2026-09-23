import type {
  DestinationKindName,
  JsonObject,
  JsonSchema,
} from "@notemap/core";

export const ARENA = "arena" as DestinationKindName;

/**
 * What a person fills in, and the whole of it: **a destination is the account**.
 * The channel is an argument rather than a setting, which is what buys browsing
 * and remembered places — both are keyed on a capability and a field, and so
 * reach arguments and nothing else.
 *
 * Account names are `examples` rather than an `enum`, which would constrain:
 * settings are re-validated on every describe, so a constraining list would
 * turn a destination `unusable` the moment an account is renamed in config.
 */
export function arenaSettings(accounts: readonly string[]): JsonSchema {
  return {
    type: "object",
    required: ["account"],
    additionalProperties: false,
    properties: {
      account: {
        type: "string",
        minLength: 1,
        title: "Account",
        description:
          "The name of an account, set in settings or declared under `[[accounts]]` in the daemon's config. The token is the account's, not this destination's.",
        ...(accounts.length === 0 ? {} : { examples: [...accounts] }),
      },
    },
  };
}

export type ArenaSettings = {
  /** The name of an account the host resolves. */
  readonly account: string;
};

/** Read rather than cast: a schema that passed once is not a type, and a row holds JSON. */
export function asArenaSettings(
  settings: JsonObject,
): ArenaSettings | undefined {
  const account = settings["account"];
  if (typeof account !== "string" || account === "") return undefined;

  return { account };
}
