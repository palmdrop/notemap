import type { Bytes } from "@notemap/relay";

import { ARENA_API, PER_PAGE } from "../constants";
import type { ArenaBlock, ArenaPage, ArenaTarget } from "./types";

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

export type Arena = ReturnType<typeof arenaAt>;

export function arenaAt(target: ArenaTarget) {
  const send = target.fetch ?? globalThis.fetch;
  const base = (target.baseUrl ?? ARENA_API).replace(/\/+$/, "");

  async function ask(route: string, signal?: AbortSignal): Promise<Response> {
    const response = await send(`${base}${route}`, {
      headers: { authorization: `Bearer ${target.token}` },
      ...(signal === undefined ? {} : { signal }),
    });

    if (!response.ok) {
      throw new ArenaRefused(
        response.status,
        route,
        (await response.text()).slice(0, 200),
      );
    }
    return response;
  }

  return {
    /**
     * Every block in the channel, in pages. The channel handle is sent
     * verbatim: are.na accepts both the numeric id and the slug.
     *
     * `total_pages` bounds the scan against a server that would otherwise
     * page forever — a page still full at that count is answered once more
     * and not asked for again.
     */
    async *contents(
      handle: string,
      signal?: AbortSignal,
    ): AsyncGenerator<ArenaBlock> {
      for (let page = 1; ; page += 1) {
        const response = await ask(
          `/v3/channels/${encodeURIComponent(handle)}/contents?page=${String(page)}&per=${String(PER_PAGE)}`,
          signal,
        );
        const body = (await response.json()) as ArenaPage;

        yield* body.data;

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
     * under a plain URL, so no bearer is attached to that request.
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
