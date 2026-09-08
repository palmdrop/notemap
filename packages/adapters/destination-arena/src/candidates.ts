import {
  NotOffered,
  type CandidatesAnswer,
  type CandidatesRequest,
  type Destination,
} from "@notemap/core";
import { CREATE } from "@notemap/output-markdown";

import type { Arena } from "./api";
import { CHANNEL_FIELD } from "./capabilities";
import { asArenaSettings } from "./settings";

export type Reach = (account: string) => Promise<Arena>;

/**
 * The channels the token's own user made, most recently updated first, and one
 * page of them: browsing is not enumerating an account, which is what are.na's
 * own guidance asks callers not to do. `truncated` says there were more.
 *
 * The **slug** is what a browse leaves in the field, so a remembered place
 * reads as the title does. Somebody who wants a template that cannot rot pastes
 * the numeric ID instead, and the field takes either.
 *
 * Nothing here descends: a channel holds blocks and a block is not a place to
 * file into, so an entry is a value and never a scope.
 */
export function arenaCandidates(reach: Reach) {
  return async (
    destination: Destination,
    request: CandidatesRequest,
    signal?: AbortSignal,
  ): Promise<CandidatesAnswer> => {
    if (request.capability !== CREATE || request.field !== CHANNEL_FIELD) {
      throw new NotOffered(
        `${request.capability} has no candidates for its ${request.field} field`,
      );
    }

    const settings = asArenaSettings(destination.settings);
    if (settings === undefined) {
      throw new Error(`${destination.name} has no readable arena settings`);
    }

    const arena = await reach(settings.account);
    const me = await arena.me(signal);
    const page = await arena.channels(me.id, signal);

    return {
      entries: page.channels.map((channel) => ({
        label: channel.title,
        value: channel.slug,
      })),
      truncated: page.more,
    };
  };
}
