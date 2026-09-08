import { ASKABLE_FIELD, OFFERED_ONLY_FIELD } from "@notemap/core";
import type { Capability, JsonObject, PayloadTypeName } from "@notemap/core";
import { CREATE } from "@notemap/output-markdown";

export const CHANNEL_FIELD = "channel";

/**
 * One capability, and it is `create`: a block is always new, and there is
 * nothing here to append into. The name is the shared one — a vault's note and
 * a board's block are one capability — but the arguments are this kind's own,
 * so the file kinds' schema is not reused.
 */
export function arenaCapabilities(
  accepts: readonly PayloadTypeName[],
): readonly Capability[] {
  return [
    {
      name: CREATE,
      accepts,
      argumentsSchema: {
        type: "object",
        required: [CHANNEL_FIELD],
        additionalProperties: false,
        properties: {
          [CHANNEL_FIELD]: {
            type: "string",
            minLength: 1,
            title: "Channel",
            description:
              "The channel, by slug or by numeric ID. A slug does not survive a retitle, so a decision that fires again is pinned to the ID.",
            [ASKABLE_FIELD]: true,
            // A channel is joined, not made: nothing a delivery does brings one
            // into being, so a pattern expanded into this field could only ever
            // name a channel that is not there.
            [OFFERED_ONLY_FIELD]: true,
          },
        },
      },
    },
  ];
}

export type ArenaArguments = {
  readonly channel: string;
};

/** Read rather than cast: a schema that passed once is not a type. */
export function asArenaArguments(args: JsonObject): ArenaArguments | undefined {
  const channel = args[CHANNEL_FIELD];
  if (typeof channel !== "string" || channel === "") return undefined;

  return { channel };
}
