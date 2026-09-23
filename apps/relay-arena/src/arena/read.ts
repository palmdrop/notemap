import type { Bytes } from "@notemap/relay";

import { ARENA_API, PER_PAGE } from "../constants";
import { pacer, resetOf, systemClock } from "./pace";
import type { ArenaBlock, ArenaPage, ArenaTarget } from "./types";

const RATE_LIMITED = 429;

/** What are.na said no to, and where. */
export class ArenaRefused extends Error {
  readonly status: number;
  readonly route: string;

  constructor(status: number, route: string, said: string) {
    super(`${route} was refused ${String(status)}${said && `: ${said}`}`);
    this.name = "ArenaRefused";
    this.status = status;
    this.route = route;
  }
}

/** A `429`: the token's window is spent, for every channel alike. */
export class ArenaRateLimited extends ArenaRefused {
  /** When are.na said the window resets, where it said. */
  readonly until: Date | undefined;

  constructor(route: string, said: string, until: Date | undefined) {
    super(RATE_LIMITED, route, said);
    this.name = "ArenaRateLimited";
    this.until = until;
    if (until !== undefined) {
      this.message += ` (the window resets ${until.toISOString()})`;
    }
  }
}

export type Arena = ReturnType<typeof arenaAt>;

export function arenaAt(target: ArenaTarget) {
  const send = target.fetch ?? globalThis.fetch;
  const base = (target.baseUrl ?? ARENA_API).replace(/\/+$/, "");
  const clock = target.clock ?? systemClock;
  const pace = pacer(clock);

  async function ask(route: string, signal?: AbortSignal): Promise<Response> {
    await pace.wait(signal);
    const response = await send(`${base}${route}`, {
      headers: { authorization: `Bearer ${target.token}` },
      ...(signal === undefined ? {} : { signal }),
    });
    pace.heard(response.headers);

    if (!response.ok) {
      const said = (await response.text()).slice(0, 200);
      if (response.status === RATE_LIMITED) {
        const reset = resetOf(response.headers, clock);
        throw new ArenaRateLimited(
          route,
          said,
          reset === undefined ? undefined : new Date(reset),
        );
      }
      throw new ArenaRefused(response.status, route, said);
    }
    return response;
  }

  return {
    /**
     * A channel's blocks a page at a time, most recently connected first, so
     * a caller that has seen enough can stop asking. The channel handle is
     * sent verbatim: are.na accepts both the numeric id and the slug.
     *
     * `total_pages` bounds the scan against a server that would otherwise
     * page forever.
     */
    async *pages(
      handle: string,
      signal?: AbortSignal,
    ): AsyncGenerator<readonly ArenaBlock[]> {
      for (let page = 1; ; page += 1) {
        const response = await ask(
          `/v3/channels/${encodeURIComponent(handle)}/contents?page=${String(page)}&per=${String(PER_PAGE)}&sort=created_at_desc`,
          signal,
        );
        const body = (await response.json()) as ArenaPage;

        yield body.data;

        if (
          !body.meta.has_more_pages ||
          body.data.length === 0 ||
          page >= body.meta.total_pages
        ) {
          return;
        }
      }
    },

    /**
     * The bytes of a block's file — an image's stored image, or an
     * attachment's file. are.na serves both from its own object storage
     * under a plain URL, so no bearer is attached to that request, and it is
     * not paced: object storage is not the API the rate limit is on.
     */
    async open(block: ArenaBlock, signal?: AbortSignal): Promise<Bytes> {
      const link = block.image?.src ?? block.attachment?.url;
      if (link === undefined) {
        throw new Error(
          `block ${String(block.id)} has no image or attachment to open`,
        );
      }

      const response = await send(link, signal === undefined ? {} : { signal });
      if (!response.ok || response.body === null) {
        throw new ArenaRefused(
          response.status,
          link,
          response.body === null ? "no bytes" : "",
        );
      }
      return response.body;
    },
  };
}
