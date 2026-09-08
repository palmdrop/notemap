import type { Bytes } from "@notemap/relay";

import { PAGE_SIZE } from "../constants";
import type { Memo, MemoPage, MemosAttachment, MemosTarget } from "./types";

/** What Memos said no to, and where. */
export class MemosRefused extends Error {
  readonly status: number;
  readonly route: string;

  constructor(status: number, route: string, said: string) {
    super(`${route} was refused ${String(status)}${said && `: ${said}`}`);
    this.name = "MemosRefused";
    this.status = status;
    this.route = route;
  }
}

export type Memos = ReturnType<typeof memosAt>;

export function memosAt(target: MemosTarget) {
  const send = target.fetch ?? globalThis.fetch;
  const base = target.url.replace(/\/+$/, "");

  async function ask(route: string, signal?: AbortSignal): Promise<Response> {
    const response = await send(`${base}${route}`, {
      headers: { authorization: `Bearer ${target.token}` },
      ...(signal === undefined ? {} : { signal }),
    });

    if (!response.ok) {
      throw new MemosRefused(
        response.status,
        route,
        (await response.text()).slice(0, 200),
      );
    }
    return response;
  }

  /** The user the token belongs to, as `users/{user}`. */
  async function whoami(signal?: AbortSignal): Promise<string> {
    const response = await ask("/api/v1/auth/me", signal);
    const body = (await response.json()) as { user?: { name?: string } };

    if (body.user?.name === undefined) {
      throw new Error("/api/v1/auth/me answered no user");
    }
    return body.user.name;
  }

  return {
    whoami,

    /**
     * Every memo the token's own user wrote, in pages. Narrowed to that user
     * because a Memos server with more than one on it would otherwise relay a
     * stranger's public memos into a private pool.
     *
     * Archived memos are left out: Memos lists the ones in `NORMAL` state
     * unless asked otherwise, and a memo archived after it was relayed stays in
     * the pool, which never loses an item.
     */
    async *mine(signal?: AbortSignal): AsyncGenerator<Memo> {
      const creator = await whoami(signal);
      const filter = `creator == "${creator}"`;
      const spent = new Set<string>();
      let token = "";

      for (;;) {
        const query = new URLSearchParams({
          pageSize: String(PAGE_SIZE),
          filter,
        });
        if (token !== "") query.set("pageToken", token);

        const response = await ask(`/api/v1/memos?${query.toString()}`, signal);
        const page = (await response.json()) as MemoPage;

        yield* page.memos ?? [];

        // A page that ended nothing ends the scan anyway: a server answering an
        // empty page under a token, or the same token twice, would otherwise be
        // read forever.
        token = page.nextPageToken ?? "";
        if (token === "" || (page.memos ?? []).length === 0) return;
        if (spent.has(token)) return;
        spent.add(token);
      }
    },

    /**
     * An attachment's bytes, streamed. `externalLink` is followed as Memos' own
     * client follows it — the bytes are not on the Memos server at all, so the
     * access token has nothing to prove there and is not sent.
     */
    async open(
      attachment: MemosAttachment,
      signal?: AbortSignal,
    ): Promise<Bytes> {
      const link = attachment.externalLink;
      const response =
        link === undefined || link === ""
          ? await ask(
              `/file/${attachment.name}/${encodeURIComponent(attachment.filename)}`,
              signal,
            )
          : await send(link, signal === undefined ? {} : { signal });

      if (!response.ok || response.body === null) {
        throw new MemosRefused(
          response.status,
          link || attachment.name,
          response.body === null ? "no bytes" : "",
        );
      }
      return response.body;
    },
  };
}
