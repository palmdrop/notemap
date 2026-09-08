import { describe, expect, it } from "vitest";

import {
  daemons,
  mintToken,
  relayMemos,
  shutWorld,
  upstreams,
  MEMOS_TOKEN,
  type Memo,
  type Relaying,
  type Upstream,
} from "./harness/index.ts";

const daemon = daemons();
const upstream = upstreams();

const SOURCE = "memos";
const WRITTEN = "2026-09-04T14:23:05.000Z";

type Item = {
  readonly id: string;
  readonly source: string;
  readonly sourceItemId: string;
  readonly createdAt: string;
  readonly tags: readonly { name: string; by: Record<string, string> }[];
  readonly payload: {
    readonly type: string;
    readonly content: Record<string, unknown>;
    readonly assets: readonly { slot: string; asset: string }[];
  };
  readonly assets?: readonly {
    id: string;
    filename: string;
    mime: string;
    bytes: number;
  }[];
};

type Relayed = {
  readonly memos: Upstream;
  readonly relay: Relaying;
  /** The pool, read the way anything holding a token reads it. */
  read(path: string): Promise<Response>;
  items(): Promise<readonly Item[]>;
};

/**
 * A Memos server, a notemap daemon with its door shut, and the relay between
 * them — three processes and two sockets, which is the whole of what this is.
 */
async function relaying(): Promise<Relayed> {
  const on = await shutWorld();
  const token = await mintToken(on, "relay-memos");
  const running = await daemon(on);
  const memos = await upstream();

  const read = (path: string) =>
    fetch(`${running.url}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });

  return {
    memos,
    relay: relayMemos({
      directory: on.directory,
      pool: { url: running.url, token },
      memos: { url: memos.url, token: MEMOS_TOKEN },
    }),
    read,
    async items() {
      const response = await read("/v1/feed");
      expect(response.status).toBe(200);
      return ((await response.json()) as { values: Item[] }).values;
    },
  };
}

function memo(uid: string, overrides: Partial<Memo> = {}): Memo {
  return {
    name: `memos/${uid}`,
    content: "written three days ago",
    createTime: WRITTEN,
    updateTime: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}

/** A poll that did what it was asked, which is what a relay usually does. */
async function polled(where: Relayed): Promise<string> {
  const { code, output } = await where.relay.poll();
  expect(output).not.toMatch(/could not/);
  expect(code).toBe(0);
  return output;
}

describe("the memos relay, over a real daemon", () => {
  it("puts a memo in the pool at the time it was written, with the tags it had", async () => {
    const where = await relaying();
    where.memos.memos.push(memo("abc", { tags: ["kind/quote"] }));

    expect(await polled(where)).toMatch(/captured 1/);

    const [held] = await where.items();
    expect(held).toMatchObject({
      source: SOURCE,
      sourceItemId: "abc",
      // Its own creation time, so it sits in the feed where it was written.
      createdAt: WRITTEN,
      payload: { type: "note", content: { text: "written three days ago" } },
      tags: [{ name: "kind/quote", by: { kind: "source", source: SOURCE } }],
    });
  });

  it("reads only the token's own user's memos", async () => {
    const where = await relaying();
    where.memos.memos.push(memo("abc"));

    await polled(where);

    expect(where.memos.filters).toEqual(['creator == "users/1"']);
  });

  it("captures nothing at all on a second run over the same memos", async () => {
    const where = await relaying();
    where.memos.memos.push(memo("abc"), memo("def"));

    await polled(where);
    expect(await polled(where)).toMatch(/captured 0, unchanged 2/);

    expect(await where.items()).toHaveLength(2);
  });

  it("carries a memo that is only pictures, and one that is both", async () => {
    const where = await relaying();
    where.memos.bytes.set("attachments/1", "PNG-ONE");
    where.memos.bytes.set("attachments/2", "PNG-TWO");
    where.memos.memos.push(
      memo("pictures", {
        content: "",
        attachments: [
          { name: "attachments/1", filename: "one.png", type: "image/png" },
        ],
      }),
      memo("both", {
        content: "a note about two pictures",
        attachments: [
          { name: "attachments/1", filename: "one.png", type: "image/png" },
          { name: "attachments/2", filename: "two.png", type: "image/png" },
        ],
      }),
    );

    await polled(where);

    const held = await where.items();
    const pictures = held.find((each) => each.sourceItemId === "pictures");
    const both = held.find((each) => each.sourceItemId === "both");

    expect(pictures?.payload.content).toEqual({});
    expect(pictures?.assets).toMatchObject([
      { filename: "one.png", mime: "image/png", bytes: 7 },
    ]);

    expect(both?.payload.content).toEqual({
      text: "a note about two pictures",
    });
    // In the order they hang off the memo, which is the order they are drawn in.
    expect(both?.payload.assets.map((each) => each.slot)).toEqual([
      "000",
      "001",
    ]);
    expect(both?.assets?.map((each) => each.filename)).toEqual([
      "one.png",
      "two.png",
    ]);
  });

  it("uploads one attachment once, however many memos and polls carry it", async () => {
    const where = await relaying();
    where.memos.bytes.set("attachments/1", "PNG-ONE");
    where.memos.memos.push(
      memo("one", {
        attachments: [
          { name: "attachments/1", filename: "one.png", type: "image/png" },
        ],
      }),
    );

    await polled(where);
    await polled(where);
    await polled(where);

    // Read from Memos once: the pool had the bytes on the second and third
    // polls, and a relay that re-sent them would have re-read them.
    expect(where.memos.read).toEqual(["attachments/1"]);
  });

  it("amends the item a memo became when the memo is edited between polls", async () => {
    const where = await relaying();
    where.memos.memos.push(memo("abc"));
    await polled(where);
    const [before] = await where.items();

    where.memos.memos[0] = memo("abc", {
      content: "rewritten since",
      updateTime: "2026-09-07T10:00:00.000Z",
    });
    expect(await polled(where)).toMatch(/amended 1/);

    const [after] = await where.items();
    expect(after?.id).toBe(before?.id);
    expect(after?.payload.content).toEqual({ text: "rewritten since" });

    // An amended item now says what the memo says, so the poll after an edit
    // is an ordinary one: only a revision leaves the original disagreeing.
    expect(await polled(where)).toMatch(/captured 0, unchanged 1, amended 0/);
    expect(await where.items()).toHaveLength(1);
  });

  it("captures nothing for a memo holding neither prose nor an attachment", async () => {
    const where = await relaying();
    where.memos.memos.push(memo("empty", { content: "  " }), memo("said"));

    expect(await polled(where)).toMatch(
      /captured 1, unchanged 0, amended 0, revised 0, empty 1/,
    );

    expect((await where.items()).map((each) => each.sourceItemId)).toEqual([
      "said",
    ]);
  });

  it("is seen to be feeding the pool by the sources it captured under", async () => {
    const where = await relaying();
    where.memos.memos.push(memo("abc"), memo("def"));
    await polled(where);

    const response = await where.read("/v1/sources");
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({
      values: [{ id: SOURCE, items: 2, lastCapturedAt: WRITTEN }],
    });
  });

  it("says what it could not do, and exits saying so", async () => {
    const where = await relaying();
    where.memos.memos.push(
      memo("gone", {
        attachments: [
          {
            name: "attachments/missing",
            filename: "one.png",
            type: "image/png",
          },
        ],
      }),
    );

    const { code, output } = await where.relay.poll();

    expect(output).toMatch(/memos\/gone could not be relayed/);
    expect(code).toBe(1);
    expect(await where.items()).toEqual([]);
  });
});
