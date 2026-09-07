import { describe, expect, it } from "vitest";

import { memosAt, MemosRefused } from "./read";
import type { Memo } from "./types";

const ME = { user: { name: "users/7" } };

type Asked = { url: URL; headers: Headers };

/** A Memos server that answers from a script, and remembers what it was asked. */
function serving(answers: Record<string, unknown>) {
  const asked: Asked[] = [];

  const fetch = ((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    asked.push({ url, headers: new Headers(init?.headers) });

    const answer = answers[url.pathname];
    if (answer === undefined) {
      return Promise.resolve(new Response("nope", { status: 404 }));
    }
    return Promise.resolve(Response.json(answer));
  }) as typeof globalThis.fetch;

  return {
    asked,
    memos: memosAt({ url: "https://m.example.com", token: "t", fetch }),
  };
}

function memo(uid: string): Memo {
  return {
    name: `memos/${uid}`,
    content: uid,
    createTime: "2026-09-04T14:23:05Z",
    updateTime: "2026-09-04T14:23:05Z",
  };
}

async function all(memos: AsyncIterable<Memo>): Promise<Memo[]> {
  const read: Memo[] = [];
  for await (const each of memos) read.push(each);
  return read;
}

describe("reading a Memos server", () => {
  it("reads only the token's own user's memos, and carries the token", async () => {
    const server = serving({
      "/api/v1/auth/me": ME,
      "/api/v1/memos": { memos: [memo("one")] },
    });

    expect(await all(server.memos.mine())).toEqual([memo("one")]);

    const listing = server.asked[1];
    expect(listing?.url.searchParams.get("filter")).toBe(
      'creator == "users/7"',
    );
    expect(listing?.headers.get("authorization")).toBe("Bearer t");
  });

  it("follows the pages until one answers no token", async () => {
    let page = 0;
    const pages = [
      { memos: [memo("one")], nextPageToken: "second" },
      { memos: [memo("two")] },
    ];

    const fetch = ((input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/auth/me")
        return Promise.resolve(Response.json(ME));
      return Promise.resolve(Response.json(pages[page++]));
    }) as typeof globalThis.fetch;

    const memos = memosAt({ url: "https://m.example.com", token: "t", fetch });

    expect((await all(memos.mine())).map((each) => each.name)).toEqual([
      "memos/one",
      "memos/two",
    ]);
  });

  it("stops on an empty page, whatever token came with it", async () => {
    const fetch = ((input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/auth/me")
        return Promise.resolve(Response.json(ME));
      return Promise.resolve(
        Response.json({ memos: [], nextPageToken: "again" }),
      );
    }) as typeof globalThis.fetch;

    const memos = memosAt({ url: "https://m.example.com", token: "t", fetch });

    expect(await all(memos.mine())).toEqual([]);
  });

  it("says what was refused and where", async () => {
    const server = serving({});

    await expect(server.memos.whoami()).rejects.toThrow(MemosRefused);
    await expect(server.memos.whoami()).rejects.toThrow(
      /\/api\/v1\/auth\/me was refused 404/,
    );
  });

  it("reads an attachment from the file route, and an external one from its link", async () => {
    const reached: { url: string; token: string | null }[] = [];
    const fetch = ((input: string | URL, init?: RequestInit) => {
      reached.push({
        url: String(input),
        token: new Headers(init?.headers).get("authorization"),
      });
      return Promise.resolve(new Response("BYTES"));
    }) as typeof globalThis.fetch;

    const memos = memosAt({ url: "https://m.example.com", token: "t", fetch });

    await memos.open({
      name: "attachments/1",
      filename: "a picture.png",
      type: "image/png",
    });
    await memos.open({
      name: "attachments/2",
      filename: "two.png",
      type: "image/png",
      externalLink: "https://bucket.example.com/two.png",
    });

    expect(reached).toEqual([
      {
        url: "https://m.example.com/file/attachments/1/a%20picture.png",
        token: "Bearer t",
      },
      // Somewhere else's address: the Memos token proves nothing there.
      { url: "https://bucket.example.com/two.png", token: null },
    ]);
  });
});
