import {
  ASKABLE_FIELD,
  CARRIES,
  CARRIES_ASSETS,
  OFFERED_ONLY_FIELD,
} from "@notemap/core";
import type {
  Capability,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
} from "@notemap/core";
import { CREATE, PLACE_ASSETS } from "@notemap/output-markdown";

export const CHANNEL_FIELD = "channel";

/**
 * Two capabilities, and both take the channel and nothing else: a block is
 * always new, so there is nothing here to append into, and a channel is joined
 * rather than made, so there is no folder mode to decide. The names are the
 * shared ones — a vault's note and a board's block are one capability — but the
 * arguments are this kind's own, so the file kinds' schema is not reused.
 *
 * `place-assets` carries the attachments alone, one block per file, and says so
 * of itself at the root of its arguments.
 */
export function arenaCapabilities(
  accepts: readonly PayloadTypeName[],
): readonly Capability[] {
  return [
    { name: CREATE, accepts, argumentsSchema: channelArguments() },
    {
      name: PLACE_ASSETS,
      accepts,
      argumentsSchema: {
        ...channelArguments(),
        [CARRIES]: CARRIES_ASSETS,
      },
    },
  ];
}

function channelArguments(): JsonSchema {
  return {
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
  };
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
