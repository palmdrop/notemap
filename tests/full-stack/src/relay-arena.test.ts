import { describe, expect, it } from "vitest";

import {
  ARENA_TOKEN,
  daemons,
  mintToken,
  relayArena,
  shutWorld,
  upstreamsArena,
  type ArenaBlock,
  type ArenaUpstream,
  type RelayingArena,
} from "./harness/index.ts";

const CONNECTED = "2026-09-04T14:23:05.000Z";

type Item = {
  readonly id: string;
  readonly source: string;
  readonly sourceItemId: string;
  readonly createdAt: string;
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
  readonly arena: ArenaUpstream;
  readonly relay: RelayingArena;
  read(path: string): Promise<Response>;
  items(): Promise<readonly Item[]>;
};

const daemon = daemons();
const upstream = upstreamsArena();

/**
 * An are.na stand-in, a notemap daemon with its door shut, and the relay
 * between them, watching two channels under two sources.
 */
async function relaying(): Promise<Relayed> {
  const on = await shutWorld();
  const token = await mintToken(on, "relay-arena");
  const running = await daemon(on);
  const arena = await upstream();
  // Both watched channels exist upstream, whether or not a test pushes a
  // block into either — an unconfigured one is a 404 in the fake, same as
  // are.na answers a channel that never existed.
  arena.channel("one");
  arena.channel("two");

  const read = (path: string) =>
    fetch(`${running.url}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });

  return {
    arena,
    relay: relayArena({
      directory: on.directory,
      pool: { url: running.url, token },
      arena: { url: arena.url, token: ARENA_TOKEN },
      channels: [
        { handle: "one", source: "arena/one" },
        { handle: "two", source: "arena/two" },
      ],
    }),
    read,
    async items() {
      const response = await read("/v1/feed");
      expect(response.status).toBe(200);
      return ((await response.json()) as { values: Item[] }).values;
    },
  };
}

function block(id: number, overrides: Partial<ArenaBlock> = {}): ArenaBlock {
  return {
    id,
    type: "Text",
    updated_at: "2026-09-07T09:00:00.000Z",
    content: { markdown: `block ${String(id)}` },
    connection: { connected_at: CONNECTED },
    ...overrides,
  };
}

async function polled(where: Relayed): Promise<string> {
  const { code, output } = await where.relay.poll();
  expect(output).not.toMatch(/could not/);
  expect(code).toBe(0);
  return output;
}

describe("the arena relay, over a real daemon", () => {
  it("puts a block in the pool at the time it was connected", async () => {
    const where = await relaying();
    where.arena
      .channel("one")
      .push(block(1, { content: { markdown: "a note" } }));

    expect(await polled(where)).toMatch(/captured 1/);

    const [held] = await where.items();
    expect(held).toMatchObject({
      source: "arena/one",
      sourceItemId: "1",
      // connected_at, not created_at, and never the time the poll ran.
      createdAt: CONNECTED,
      payload: { type: "note", content: { text: "a note" } },
    });
  });

  it("captures nothing at all on a second run over the same channel", async () => {
    const where = await relaying();
    where.arena.channel("one").push(block(1), block(2));

    await polled(where);
    expect(await polled(where)).toMatch(/captured 0, unchanged 2/);

    expect(await where.items()).toHaveLength(2);
  });

  it("carries an image block's stored image as an asset", async () => {
    const where = await relaying();
    where.arena.objects.set("pic", "PNG-BYTES");
    where.arena.channel("one").push(
      block(1, {
        type: "Image",
        title: "a picture",
        content: null,
        image: {
          filename: "a.png",
          content_type: "image/png",
          src: where.arena.objectUrl("pic"),
        },
      }),
    );

    await polled(where);

    const [held] = await where.items();
    expect(held?.payload.content).toEqual({ text: "a picture" });
    expect(held?.assets).toMatchObject([
      { filename: "a.png", mime: "image/png", bytes: "PNG-BYTES".length },
    ]);
  });

  it("uploads one image once, however many polls carry it", async () => {
    const where = await relaying();
    where.arena.objects.set("pic", "PNG-BYTES");
    where.arena.channel("one").push(
      block(1, {
        type: "Image",
        content: null,
        image: {
          filename: "a.png",
          content_type: "image/png",
          src: where.arena.objectUrl("pic"),
        },
      }),
    );

    await polled(where);
    await polled(where);

    // The pool had the bytes on the second poll, and a relay that re-sent
    // them would have re-read them.
    expect(where.arena.read).toEqual(["pic"]);
  });

  it("amends the item a block became when the block is edited between polls", async () => {
    const where = await relaying();
    where.arena.channel("one").push(block(1));
    await polled(where);
    const [before] = await where.items();

    where.arena.channel("one")[0] = block(1, {
      content: { markdown: "rewritten since" },
      updated_at: "2026-09-08T09:00:00.000Z",
    });
    expect(await polled(where)).toMatch(/amended 1/);

    const [after] = await where.items();
    expect(after?.id).toBe(before?.id);
    expect(after?.payload.content).toEqual({ text: "rewritten since" });
  });

  it("relays nothing for a Channel-class block", async () => {
    const where = await relaying();
    where.arena
      .channel("one")
      .push(block(1, { type: "Channel", content: null }));

    expect(await polled(where)).toMatch(/empty 1/);
    expect(await where.items()).toEqual([]);
  });

  it("puts a block in a second channel under its own source", async () => {
    const where = await relaying();
    where.arena
      .channel("one")
      .push(block(1, { content: { markdown: "in one" } }));
    where.arena
      .channel("two")
      .push(block(2, { content: { markdown: "in two" } }));

    await polled(where);

    const held = await where.items();
    expect(
      held.map((each) => ({ source: each.source, id: each.sourceItemId })),
    ).toEqual(
      expect.arrayContaining([
        { source: "arena/one", id: "1" },
        { source: "arena/two", id: "2" },
      ]),
    );

    const response = await where.read("/v1/sources");
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toMatchObject({
      values: expect.arrayContaining([
        expect.objectContaining({ id: "arena/one", items: 1 }),
        expect.objectContaining({ id: "arena/two", items: 1 }),
      ]),
    });
  });
});
