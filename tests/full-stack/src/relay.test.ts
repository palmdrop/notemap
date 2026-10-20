import { createRelay, type Attachment, type Relayed } from "@notemap/relay";
import { describe, expect, it } from "vitest";

import {
  daemons,
  mintToken,
  shutWorld,
  type Running,
} from "./harness/index.ts";

const daemon = daemons();

/** One per relay instance, fixed for its lifetime. */
const NAMESPACE = "0198f0c2-0000-7000-8000-0000000000aa";
const UPSTREAM = "somewhere-else";

type Relaying = {
  readonly running: Running;
  readonly relay: ReturnType<typeof createRelay>;
  /** The pool as this test reads it back, carrying what the relay carries. */
  read(path: string, init?: RequestInit): Promise<Response>;
};

/**
 * A relay over a real daemon with its door shut, carrying a token the way one
 * does: it is not a browser and has no session to take.
 */
async function relaying(): Promise<Relaying> {
  const on = await shutWorld();
  const token = await mintToken(on, "a relay");
  const running = await daemon(on);

  const relay = createRelay({
    pool: { url: running.url, token },
    source: UPSTREAM,
    namespace: NAMESPACE,
  });

  return {
    running,
    relay,
    read: (path, init) =>
      fetch(`${running.url}${path}`, {
        ...init,
        headers: { ...init?.headers, authorization: `Bearer ${token}` },
      }),
  };
}

/** An upstream item, as a relay's own mapping would hand it over. */
function upstream(overrides: Partial<Relayed> = {}): Relayed {
  return {
    sourceItemId: "u-1",
    version: "2026-09-07T09:00:00Z",
    capturedAt: "2026-09-04T14:23:05.000Z",
    text: "written three days ago",
    tags: [],
    attachments: [],
    ...overrides,
  };
}

function attached(
  id: string,
  filename = "whiteboard.png",
  content = "PNG-BYTES",
): Attachment & { opened: () => number } {
  let opened = 0;
  return {
    id,
    filename,
    mime: "image/png",
    open: async () => {
      opened += 1;
      return new TextEncoder().encode(content);
    },
    opened: () => opened,
  };
}

type Item = {
  readonly id: string;
  readonly source: string;
  readonly sourceItemId: string;
  readonly createdAt: string;
  readonly revisedInto: readonly string[];
  readonly tags: readonly { name: string; by: Record<string, string> }[];
  readonly payload: {
    type: string;
    content: Record<string, unknown>;
    assets: readonly { slot: string; asset: string }[];
  };
  readonly assets?: readonly Record<string, unknown>[];
};

async function itemAt(pool: Relaying, id: string): Promise<Item> {
  const response = await pool.read(`/v1/items/${id}`);
  if (response.status !== 200) {
    throw new Error(`reading ${id} answered ${String(response.status)}`);
  }
  return (await response.json()) as Item;
}

/** An edit made in a shell, under the shell's own channel rather than the relay's. */
async function editedByHand(
  pool: Relaying,
  id: string,
  text: string,
): Promise<void> {
  const response = await pool.read(`/v1/items/${id}/edit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "web-manual",
      sourceItemId: `edit-of-${id}`,
      payload: { type: "note", content: { text }, metadata: {}, assets: [] },
    }),
  });
  expect(response.status).toBe(200);
  expect(((await response.json()) as { kind: string }).kind).toBe("amended");
}

describe("a relay feeding the pool from outside", () => {
  it("captures on its first run and nothing at all on its second", async () => {
    const pool = await relaying();
    const memo = upstream();

    const first = await pool.relay.relay(memo);
    expect(first.kind).toBe("captured");

    const second = await pool.relay.relay(memo);
    expect(second).toEqual({ kind: "already-captured", item: first.item });

    const held = await itemAt(pool, first.item);
    expect(held.source).toBe(UPSTREAM);
    expect(held.sourceItemId).toBe("u-1");
    expect(held.payload).toMatchObject({
      type: "note",
      content: { text: "written three days ago" },
    });
    // Its own capture time, so it sits in the feed where it was written.
    expect(held.createdAt).toBe("2026-09-04T14:23:05.000Z");
  });

  it("attributes the tags it arrived with to the source it came from", async () => {
    const pool = await relaying();

    const landed = await pool.relay.relay(upstream({ tags: ["kind/quote"] }));

    expect((await itemAt(pool, landed.item)).tags).toMatchObject([
      { name: "kind/quote", by: { kind: "source", source: UPSTREAM } },
    ]);
  });

  it("amends an unprocessed item when the thing upstream changes", async () => {
    const pool = await relaying();
    const captured = await pool.relay.relay(upstream());

    const edited = await pool.relay.relay(
      upstream({ version: "2026-09-07T10:00:00Z", text: "rewritten since" }),
    );

    expect(edited).toEqual({ kind: "amended", item: captured.item });
    expect((await itemAt(pool, captured.item)).payload.content).toEqual({
      text: "rewritten since",
    });
  });

  it("revises a processed item, and adds no second revision on a re-run", async () => {
    const pool = await relaying();
    const captured = await pool.relay.relay(upstream());

    const marked = await pool.read(
      `/v1/items/${captured.item}/mark-processed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "carried it by hand" }),
      },
    );
    expect(marked.status).toBe(200);

    const changed = upstream({
      version: "2026-09-07T10:00:00Z",
      text: "rewritten since",
    });
    const revised = await pool.relay.relay(changed);
    expect(revised.kind).toBe("revised");
    expect(revised.item).not.toBe(captured.item);

    // A re-read resolves to the revision, which says what upstream says.
    const unchanged = { kind: "already-captured", item: revised.item };
    expect(await pool.relay.relay(changed)).toEqual(unchanged);
    expect(await pool.relay.relay(changed)).toEqual(unchanged);

    expect((await itemAt(pool, captured.item)).revisedInto).toEqual([
      revised.item,
    ]);
    expect((await itemAt(pool, revised.item)).sourceItemId).toBe(
      "u-1@2026-09-07T10:00:00Z",
    );
  });

  it("keeps a person's edit through a re-read of what upstream has not changed", async () => {
    const pool = await relaying();
    const memo = upstream();
    const captured = await pool.relay.relay(memo);
    await editedByHand(pool, captured.item, "as I meant it");

    expect(await pool.relay.relay(memo)).toEqual({
      kind: "already-captured",
      item: captured.item,
    });
    expect((await itemAt(pool, captured.item)).payload.content).toEqual({
      text: "as I meant it",
    });
  });

  it("makes no revision of an item edited by hand and then processed, on a re-read of the same version", async () => {
    const pool = await relaying();
    const memo = upstream();
    const captured = await pool.relay.relay(memo);
    await editedByHand(pool, captured.item, "as I meant it");

    const marked = await pool.read(
      `/v1/items/${captured.item}/mark-processed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(marked.status).toBe(200);

    await pool.relay.relay(memo);

    expect((await itemAt(pool, captured.item)).revisedInto).toEqual([]);
  });

  it("continues an item changed both upstream and by hand, and follows the continuation after", async () => {
    const pool = await relaying();
    const captured = await pool.relay.relay(upstream());
    await editedByHand(pool, captured.item, "as I meant it");

    const changed = upstream({
      version: "2026-09-07T10:00:00Z",
      text: "rewritten since",
    });
    const continued = await pool.relay.relay(changed);
    expect(continued.kind).toBe("continued");
    expect(continued.item).not.toBe(captured.item);
    expect(await pool.relay.relay(changed)).toEqual({
      kind: "already-captured",
      item: continued.item,
    });

    const again = await pool.relay.relay(
      upstream({ version: "2026-09-07T11:00:00Z", text: "and again" }),
    );
    expect(again).toEqual({ kind: "amended", item: continued.item });
    expect((await itemAt(pool, captured.item)).payload.content).toEqual({
      text: "as I meant it",
    });
  });

  it("chains a second upstream edit on the revision the first one made", async () => {
    const pool = await relaying();
    const captured = await pool.relay.relay(upstream());
    const marking = (item: string) =>
      pool.read(`/v1/items/${item}/mark-processed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

    await marking(captured.item);
    const first = await pool.relay.relay(
      upstream({ version: "2026-09-07T10:00:00Z", text: "second" }),
    );
    await marking(first.item);
    const second = await pool.relay.relay(
      upstream({ version: "2026-09-07T11:00:00Z", text: "third" }),
    );

    expect(second.kind).toBe("revised");
    expect((await itemAt(pool, captured.item)).revisedInto).toEqual([
      first.item,
    ]);
    expect((await itemAt(pool, first.item)).revisedInto).toEqual([second.item]);
  });

  it("uploads an attachment once across three runs, and never mints a new id", async () => {
    const pool = await relaying();
    const picture = attached("resource/1");
    const memo = upstream({ attachments: [picture] });

    const first = await pool.relay.relay(memo);
    await pool.relay.relay(memo);
    await pool.relay.relay(memo);

    // Read from upstream once: the pool already had the bytes on runs two and
    // three, and a relay that re-sent them would re-read them.
    expect(picture.opened()).toBe(1);

    const held = await itemAt(pool, first.item);
    expect(held.assets).toEqual([
      {
        id: pool.relay.assetIdFor(picture),
        filename: "whiteboard.png",
        mime: "image/png",
        blob: expect.any(String) as unknown,
        bytes: 9,
      },
    ]);
  });

  it("gives the same picture under two upstream names two assets", async () => {
    const pool = await relaying();
    const mum = attached("resource/1", "mum.png", "SAME-BYTES");
    const dad = attached("resource/2", "dad.png", "SAME-BYTES");

    const landed = await pool.relay.relay(
      upstream({ attachments: [mum, dad] }),
    );

    const held = await itemAt(pool, landed.item);
    expect(held.assets?.map((asset) => asset["filename"])).toEqual([
      "mum.png",
      "dad.png",
    ]);
    expect(pool.relay.assetIdFor(mum)).not.toBe(pool.relay.assetIdFor(dad));
  });

  it("names the slots after their order, so a rendering draws them in it", async () => {
    const pool = await relaying();

    const landed = await pool.relay.relay(
      upstream({
        attachments: [attached("resource/1"), attached("resource/2")],
      }),
    );

    const held = await itemAt(pool, landed.item);
    expect(held.payload.assets.map((each) => each.slot)).toEqual([
      "000",
      "001",
    ]);
  });
});
