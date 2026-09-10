import {
  NotOffered,
  type CandidatesAnswer,
  type CandidatesRequest,
  type Destination,
  type NamingAnswer,
  type NamingRequest,
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
 * The **slug** is what a browse leaves in a decision made once, so a remembered
 * place reads as the title does; the **numeric ID** rides along as the entry's
 * durable form, and a template takes that instead, because a slug does not
 * survive a retitle and a template fires on a tag for months.
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
        // The numeric ID beside the slug, so a decision that fires again can
        // be pinned to the one name a retitle does not change. Which of the
        // two a surface takes is its own business.
        durable: String(channel.id),
      })),
      truncated: page.more,
    };
  };
}

/**
 * What one channel handle is called, asked by either name it answers to. The
 * browse answers one page on purpose — are.na's own guidance asks callers not
 * to enumerate an account — so a template pinned to a channel outside that page
 * has no name in it, and this is the only way to read one back.
 */
export function arenaNaming(reach: Reach) {
  return async (
    destination: Destination,
    request: NamingRequest,
    signal?: AbortSignal,
  ): Promise<NamingAnswer> => {
    if (request.capability !== CREATE || request.field !== CHANNEL_FIELD) {
      throw new NotOffered(
        `${request.capability} has no candidates for its ${request.field} field`,
      );
    }

    const settings = asArenaSettings(destination.settings);
    if (settings === undefined) {
      throw new Error(`${destination.name} has no readable arena settings`);
    }

    if (request.value === "") return {};

    const arena = await reach(settings.account);
    const channel = await arena.channel(request.value, signal);
    if (channel === undefined) return {};

    return {
      entry: {
        label: channel.title,
        value: channel.slug,
        durable: String(channel.id),
      },
    };
  };
}
