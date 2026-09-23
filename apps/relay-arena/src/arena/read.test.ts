import { describe, expect, it } from "vitest";

import type { Clock } from "./pace";
import { arenaAt, ArenaRateLimited, ArenaRefused } from "./read";
import type { ArenaBlock } from "./types";

/** A clock that never waits, and keeps what it was asked to wait. */
function still(at = 1_000_000): Clock & { slept: number[] } {
  const slept: number[] = [];
  return {
    slept,
    now: () => at,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

function block(id: number, overrides: Partial<ArenaBlock> = {}): ArenaBlock {
  return {
    id,
    type: "Text",
    content: { markdown: `block ${String(id)}` },
    connection: { connected_at: "2026-09-04T14:23:05Z" },
    ...overrides,
  };
}

async function all(
  pages: AsyncIterable<readonly ArenaBlock[]>,
): Promise<ArenaBlock[]> {
  const read: ArenaBlock[] = [];
  for await (const page of pages) read.push(...page);
  return read;
}

/** `count` pages of one block each, every answer carrying `headers`. */
function paged(
  count: number,
  headers: Record<string, string>,
): typeof globalThis.fetch {
  let page = 0;
  return (() => {
    page += 1;
    return Promise.resolve(
      Response.json(
        {
          data: [block(page)],
          meta: { has_more_pages: page < count, total_pages: count },
        },
        { headers },
      ),
    );
  }) as typeof globalThis.fetch;
}

describe("reading a channel from are.na", () => {
  it("carries the token, sends the handle verbatim and asks for the newest connection first", async () => {
    const reached: { url: URL; headers: Headers }[] = [];
    const fetch = ((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      reached.push({ url, headers: new Headers(init?.headers) });
      return Promise.resolve(
        Response.json({
          data: [block(1)],
          meta: { has_more_pages: false, total_pages: 1 },
        }),
      );
    }) as typeof globalThis.fetch;

    const arena = arenaAt({
      token: "t",
      fetch,
      baseUrl: "https://x.example",
      clock: still(),
    });

    expect((await all(arena.pages("some slug"))).map((b) => b.id)).toEqual([1]);
    expect(reached[0]?.url.pathname).toBe("/v3/channels/some%20slug/contents");
    expect(reached[0]?.url.searchParams.get("sort")).toBe("created_at_desc");
    expect(reached[0]?.headers.get("authorization")).toBe("Bearer t");
  });

  it("follows the pages until the last one answers no more", async () => {
    const pages = [
      {
        data: [block(1), block(2)],
        meta: { has_more_pages: true, total_pages: 2 },
      },
      { data: [block(3)], meta: { has_more_pages: false, total_pages: 2 } },
    ];
    let page = 0;
    const fetch = (() =>
      Promise.resolve(Response.json(pages[page++]))) as typeof globalThis.fetch;

    const arena = arenaAt({
      token: "t",
      fetch,
      baseUrl: "https://x.example",
      clock: still(),
    });

    expect((await all(arena.pages("c"))).map((b) => b.id)).toEqual([1, 2, 3]);
  });

  it("stops on an empty page, whatever it claims", async () => {
    const fetch = (() =>
      Promise.resolve(
        Response.json({
          data: [],
          meta: { has_more_pages: true, total_pages: 5 },
        }),
      )) as typeof globalThis.fetch;

    const arena = arenaAt({
      token: "t",
      fetch,
      baseUrl: "https://x.example",
      clock: still(),
    });

    expect(await all(arena.pages("c"))).toEqual([]);
  });

  it("stops at the page count it was told, whatever a page keeps claiming", async () => {
    let asked = 0;
    const fetch = (() => {
      asked += 1;
      return Promise.resolve(
        Response.json({
          data: [block(asked)],
          meta: { has_more_pages: true, total_pages: 2 },
        }),
      );
    }) as typeof globalThis.fetch;

    const arena = arenaAt({
      token: "t",
      fetch,
      baseUrl: "https://x.example",
      clock: still(),
    });

    expect((await all(arena.pages("c"))).map((b) => b.id)).toEqual([1, 2]);
    expect(asked).toBe(2);
  });

  it("says what was refused and where, for a missing channel and a bad token", async () => {
    const notFound = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock: still(),
      fetch: (() =>
        Promise.resolve(
          new Response("no such channel", { status: 404 }),
        )) as typeof globalThis.fetch,
    });

    await expect(all(notFound.pages("gone"))).rejects.toThrow(ArenaRefused);
    await expect(all(notFound.pages("gone"))).rejects.toThrow(
      /was refused 404/,
    );

    const unauthorized = arenaAt({
      token: "bad",
      baseUrl: "https://x.example",
      clock: still(),
      fetch: (() =>
        Promise.resolve(
          new Response("unauthorized", { status: 401 }),
        )) as typeof globalThis.fetch,
    });

    await expect(all(unauthorized.pages("c"))).rejects.toThrow(
      /was refused 401/,
    );
  });

  it("answers a 429 as rate-limited, with the reset are.na named", async () => {
    const arena = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock: still(),
      fetch: (() =>
        Promise.resolve(
          new Response("slow down", {
            status: 429,
            headers: { "x-ratelimit-reset": "1790160480" },
          }),
        )) as typeof globalThis.fetch,
    });

    const refused = await all(arena.pages("c")).catch(
      (cause: unknown) => cause,
    );
    expect(refused).toBeInstanceOf(ArenaRateLimited);
    expect((refused as ArenaRateLimited).until?.toISOString()).toBe(
      "2026-09-23T10:48:00.000Z",
    );
  });

  it("goes straight on while the window has requests to spare", async () => {
    const clock = still();
    const arena = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock,
      fetch: paged(3, {
        "x-ratelimit-remaining": "20",
        "x-ratelimit-reset": "1001",
      }),
    });

    await all(arena.pages("c"));
    expect(clock.slept).toEqual([]);
  });

  it("waits for the reset once the window is down to its reserve", async () => {
    const clock = still(1_000_000);
    const arena = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock,
      fetch: paged(2, {
        "x-ratelimit-remaining": "5",
        "x-ratelimit-reset": "1030",
      }),
    });

    await all(arena.pages("c"));
    expect(clock.slept).toEqual([30_000]);
  });

  it("never waits longer than one window, whatever reset it is told", async () => {
    const clock = still(1_000_000);
    const arena = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock,
      fetch: paged(2, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "999999999",
      }),
    });

    await all(arena.pages("c"));
    expect(clock.slept).toEqual([60_000]);
  });

  it("leaves a fixed gap between requests where are.na sends no rate-limit headers", async () => {
    const clock = still();
    const arena = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock,
      fetch: paged(3, {}),
    });

    await all(arena.pages("c"));
    expect(clock.slept).toEqual([500, 500]);
  });

  it("opens an image's stored file and an attachment's file with no authorization header", async () => {
    const reached: { url: string; token: string | null }[] = [];
    const fetch = ((input: string | URL, init?: RequestInit) => {
      reached.push({
        url: String(input),
        token: new Headers(init?.headers).get("authorization"),
      });
      return Promise.resolve(new Response("BYTES"));
    }) as typeof globalThis.fetch;

    const arena = arenaAt({
      token: "t",
      fetch,
      baseUrl: "https://x.example",
      clock: still(),
    });

    await arena.open(
      block(1, {
        type: "Image",
        image: {
          filename: "a.png",
          content_type: "image/png",
          src: "https://images.example.com/a.png",
        },
      }),
    );
    await arena.open(
      block(2, {
        type: "Attachment",
        attachment: {
          filename: "a.pdf",
          content_type: "application/pdf",
          url: "https://attachments.example.com/a.pdf",
        },
      }),
    );

    expect(reached).toEqual([
      { url: "https://images.example.com/a.png", token: null },
      { url: "https://attachments.example.com/a.pdf", token: null },
    ]);
  });

  it("refuses to open a block with neither an image nor an attachment", async () => {
    const arena = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      clock: still(),
      fetch: (() =>
        Promise.reject(
          new Error("should not be called"),
        )) as typeof globalThis.fetch,
    });

    await expect(arena.open(block(1))).rejects.toThrow(
      /has no image or attachment/,
    );
  });
});
