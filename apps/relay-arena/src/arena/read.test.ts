import { describe, expect, it } from "vitest";

import { arenaAt, ArenaRefused } from "./read";
import type { ArenaBlock } from "./types";

function block(id: number, overrides: Partial<ArenaBlock> = {}): ArenaBlock {
  return {
    id,
    type: "Text",
    updated_at: "2026-09-04T14:23:05Z",
    content: { markdown: `block ${String(id)}` },
    connection: { connected_at: "2026-09-04T14:23:05Z" },
    ...overrides,
  };
}

async function all(blocks: AsyncIterable<ArenaBlock>): Promise<ArenaBlock[]> {
  const read: ArenaBlock[] = [];
  for await (const each of blocks) read.push(each);
  return read;
}

describe("reading a channel from are.na", () => {
  it("carries the token and sends the handle verbatim", async () => {
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

    const arena = arenaAt({ token: "t", fetch, baseUrl: "https://x.example" });

    expect((await all(arena.contents("some slug"))).map((b) => b.id)).toEqual(
      [1],
    );
    expect(reached[0]?.url.pathname).toBe(
      "/v3/channels/some%20slug/contents",
    );
    expect(reached[0]?.headers.get("authorization")).toBe("Bearer t");
  });

  it("follows the pages until the last one answers no more", async () => {
    const pages = [
      { data: [block(1), block(2)], meta: { has_more_pages: true, total_pages: 2 } },
      { data: [block(3)], meta: { has_more_pages: false, total_pages: 2 } },
    ];
    let page = 0;
    const fetch = (() =>
      Promise.resolve(Response.json(pages[page++]))) as typeof globalThis.fetch;

    const arena = arenaAt({ token: "t", fetch, baseUrl: "https://x.example" });

    expect((await all(arena.contents("c"))).map((b) => b.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("stops on an empty page, whatever it claims", async () => {
    const fetch = (() =>
      Promise.resolve(
        Response.json({
          data: [],
          meta: { has_more_pages: true, total_pages: 5 },
        }),
      )) as typeof globalThis.fetch;

    const arena = arenaAt({ token: "t", fetch, baseUrl: "https://x.example" });

    expect(await all(arena.contents("c"))).toEqual([]);
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

    const arena = arenaAt({ token: "t", fetch, baseUrl: "https://x.example" });

    expect((await all(arena.contents("c"))).map((b) => b.id)).toEqual([1, 2]);
    expect(asked).toBe(2);
  });

  it("says what was refused and where, for a missing channel and a bad token", async () => {
    const notFound = arenaAt({
      token: "t",
      baseUrl: "https://x.example",
      fetch: (() =>
        Promise.resolve(
          new Response("no such channel", { status: 404 }),
        )) as typeof globalThis.fetch,
    });

    await expect(all(notFound.contents("gone"))).rejects.toThrow(
      ArenaRefused,
    );
    await expect(all(notFound.contents("gone"))).rejects.toThrow(
      /was refused 404/,
    );

    const unauthorized = arenaAt({
      token: "bad",
      baseUrl: "https://x.example",
      fetch: (() =>
        Promise.resolve(
          new Response("unauthorized", { status: 401 }),
        )) as typeof globalThis.fetch,
    });

    await expect(all(unauthorized.contents("c"))).rejects.toThrow(
      /was refused 401/,
    );
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

    const arena = arenaAt({ token: "t", fetch, baseUrl: "https://x.example" });

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
