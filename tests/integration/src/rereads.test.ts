import type {
  CaptureOutcome,
  EditEnvelope,
  EditOutcome,
  Item,
  ItemId,
  Payload,
  Pool,
  SourceId,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  envelope,
  harness,
  itemRecord,
  TEXT,
  WATCHED_FOLDER,
  type Harness,
} from "./fixture";

const PERSON = { kind: "person" } as const;
const SHELL = "shell/web" as SourceId;
const UPSTREAM_ID = "upstream-1";

const open: Harness[] = [];

function pool(): Harness {
  const opened = harness();
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function succeeded<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

function text(value: string): Payload {
  return { type: TEXT, content: { text: value }, metadata: {}, assets: [] };
}

/** The watched source reading its item again, saying `said`. */
function reread(
  p: Pool,
  said: string,
  overrides: { sourceItemId?: string; continues?: ItemId } = {},
) {
  return p.capture({
    ...envelope({
      source: WATCHED_FOLDER,
      sourceItemId: overrides.sourceItemId ?? UPSTREAM_ID,
      text: said,
    }),
    ...(overrides.continues === undefined
      ? {}
      : { continues: overrides.continues }),
  });
}

async function relayed(p: Pool, said = "as it was written"): Promise<Item> {
  const outcome: CaptureOutcome = succeeded(await reread(p, said));
  return outcome.item;
}

function byHand(value: string, sourceItemId = "edit-1"): EditEnvelope {
  return { source: SHELL, sourceItemId, payload: text(value) };
}

function upstream(value: string, version: string): EditEnvelope {
  return {
    source: WATCHED_FOLDER,
    sourceItemId: `${UPSTREAM_ID}@${version}`,
    payload: text(value),
  };
}

function revision(outcome: EditOutcome): Item {
  if (outcome.kind !== "revised") {
    throw new Error(`expected a revision, got ${outcome.kind}`);
  }
  return outcome.revision;
}

describe("a re-read after a person's edit", () => {
  it("is a replay, and leaves the person's words where they are", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));

    const again = succeeded(await reread(p, "as it was written"));

    expect(again).toMatchObject({
      kind: "already-captured",
      item: { id: item.id, payload: text("as I meant it") },
    });
    expect(again.item.sourceWord).toEqual(text("as it was written"));
  });

  it("makes no revision once the item is processed", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));
    await p.routing.markProcessed(item.id, "filed by hand");

    const again = succeeded(await reread(p, "as it was written"));

    expect(again.kind).toBe("already-captured");
    expect((await p.items.get(item.id))?.revisedInto).toEqual([]);
  });

  it("forgets the source's word once the person writes it back", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));
    succeeded(
      await p.items.edit(
        item.id,
        byHand("as it was written", "edit-2"),
        PERSON,
      ),
    );

    expect((await p.items.get(item.id))?.sourceWord).toBeUndefined();
  });

  it("follows a revision the person made, which carries the source's word", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    await p.routing.markProcessed(item.id, "filed by hand");
    const made = revision(
      succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON)),
    );

    expect(made.sourceWord).toEqual(text("as it was written"));
    expect(succeeded(await reread(p, "as it was written"))).toMatchObject({
      kind: "already-captured",
      item: { id: made.id },
    });
  });
});

describe("an edit upstream, where nobody else edited", () => {
  it("names the item holding the identity while nothing follows it", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);

    expect(await reread(p, "rewritten upstream")).toEqual({
      kind: "refused",
      refusal: { kind: "source-item-changed", existing: item.id },
    });
  });

  it("keeps no source's word, the source being the one that said it", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);

    const outcome = succeeded(
      await p.items.edit(item.id, upstream("rewritten upstream", "v2"), PERSON),
    );

    expect(outcome.kind).toBe("amended");
    expect((await p.items.get(item.id))?.sourceWord).toBeUndefined();
  });

  it("chains a second edit on the first revision rather than beside it", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    await p.routing.markProcessed(item.id, "filed by hand");

    const first = revision(
      succeeded(await p.items.edit(item.id, upstream("second", "v2"), PERSON)),
    );
    await p.routing.markProcessed(first.id, "filed by hand");

    expect(await reread(p, "third")).toEqual({
      kind: "refused",
      refusal: { kind: "source-item-changed", existing: first.id },
    });
    const second = revision(
      succeeded(await p.items.edit(first.id, upstream("third", "v3"), PERSON)),
    );

    expect(second.revisionOf).toBe(first.id);
    expect((await p.items.get(item.id))?.revisedInto).toEqual([first.id]);
    expect(succeeded(await reread(p, "third"))).toMatchObject({
      kind: "already-captured",
      item: { id: second.id },
    });
  });
});

describe("an edit upstream and one in the pool", () => {
  async function diverged() {
    const opened = pool();
    const item = await relayed(opened.pool);
    succeeded(
      await opened.pool.items.edit(item.id, byHand("as I meant it"), PERSON),
    );
    return { ...opened, item };
  }

  it("is refused as diverged, naming the head", async () => {
    const { pool: p, item } = await diverged();

    expect(await reread(p, "rewritten upstream")).toEqual({
      kind: "refused",
      refusal: { kind: "source-item-diverged", existing: item.id },
    });
  });

  it("is continued by a capture that the line follows from then on", async () => {
    const { pool: p, item } = await diverged();

    const continuation = succeeded(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    );
    expect(continuation).toMatchObject({
      kind: "captured",
      item: { continues: item.id, payload: text("rewritten upstream") },
    });

    expect(succeeded(await reread(p, "rewritten upstream"))).toMatchObject({
      kind: "already-captured",
      item: { id: continuation.item.id },
    });
    expect(
      succeeded(
        await reread(p, "rewritten upstream", {
          sourceItemId: `${UPSTREAM_ID}@v2`,
          continues: item.id,
        }),
      ),
    ).toMatchObject({
      kind: "already-captured",
      item: { id: continuation.item.id },
    });
    expect(await reread(p, "rewritten again")).toEqual({
      kind: "refused",
      refusal: { kind: "source-item-changed", existing: continuation.item.id },
    });
  });

  it("leaves both in the queue, the continuation processing nothing", async () => {
    const { pool: p, item } = await diverged();
    const continuation = succeeded(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    ).item;

    const queued = await p.views.queue({ limit: 10 });

    expect(queued.values.map((each) => each.id).sort()).toEqual(
      [item.id, continuation.id].sort(),
    );
  });

  it("refuses to continue what is not the head of a line from that source", async () => {
    const { pool: p, item } = await diverged();
    succeeded(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    );
    const other = succeeded(
      await p.capture(envelope({ source: SHELL, sourceItemId: "typed" })),
    ).item;

    for (const continues of [item.id, other.id, "nothing-here" as ItemId]) {
      expect(
        await reread(p, "rewritten again", {
          sourceItemId: `${UPSTREAM_ID}@v3-${continues}`,
          continues,
        }),
      ).toEqual({
        kind: "refused",
        refusal: { kind: "continues-not-head", continues },
      });
    }
  });

  it("mirrors the continuation's link and the edited item's source word", async () => {
    const { pool: p, item } = await diverged();
    const continuation = succeeded(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    ).item;

    expect((await itemRecord(p, item.id))?.item.sourceWord).toEqual(
      text("as it was written"),
    );
    expect((await itemRecord(p, continuation.id))?.item.continues).toBe(
      item.id,
    );
  });
});

describe("the edges of a line", () => {
  it("takes no notice of a capture time that changed upstream", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));

    const again = succeeded(
      await p.capture(
        envelope({
          source: WATCHED_FOLDER,
          sourceItemId: UPSTREAM_ID,
          capturedAt: "2026-08-07T09:00:00.000Z",
          utcOffset: 120,
          text: "as it was written",
        }),
      ),
    );

    expect(again).toMatchObject({
      kind: "already-captured",
      item: { id: item.id, createdAt: item.createdAt },
    });
  });

  it("keeps no source's word on a revision the source made itself", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));
    await p.routing.markProcessed(item.id, "filed by hand");

    const made = revision(
      succeeded(
        await p.items.edit(item.id, upstream("from upstream", "v2"), PERSON),
      ),
    );

    expect(made.sourceWord).toBeUndefined();
  });

  it("carries the source's word down a chain of revisions made by hand", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    await p.routing.markProcessed(item.id, "filed by hand");
    const first = revision(
      succeeded(await p.items.edit(item.id, byHand("mine"), PERSON)),
    );
    await p.routing.markProcessed(first.id, "filed by hand");

    const second = revision(
      succeeded(
        await p.items.edit(first.id, byHand("mine again", "edit-2"), PERSON),
      ),
    );

    expect(second.sourceWord).toEqual(text("as it was written"));
    expect(succeeded(await reread(p, "as it was written"))).toMatchObject({
      kind: "already-captured",
      item: { id: second.id },
    });
  });

  it("answers a continuation's resend after a person edited it", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));
    const continuing = {
      sourceItemId: `${UPSTREAM_ID}@v2`,
      continues: item.id,
    };
    const continuation = succeeded(
      await reread(p, "rewritten upstream", continuing),
    ).item;
    succeeded(
      await p.items.edit(continuation.id, byHand("and mine", "edit-2"), PERSON),
    );

    expect(
      succeeded(await reread(p, "rewritten upstream", continuing)),
    ).toMatchObject({
      kind: "already-captured",
      item: { id: continuation.id },
    });
  });

  it("refuses to continue a head nobody else has edited", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);

    expect(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    ).toEqual({
      kind: "refused",
      refusal: { kind: "continues-not-head", continues: item.id },
    });
  });

  it("still refuses a shell's replay of a capture it has since edited", async () => {
    const { pool: p } = pool();
    const typed = envelope({
      id: "typed",
      source: SHELL,
      sourceItemId: "typed",
    });
    const item = succeeded(await p.capture(typed)).item;
    succeeded(
      await p.items.edit(
        item.id,
        {
          source: SHELL,
          sourceItemId: "edit-1",
          payload: text("as I meant it"),
        },
        PERSON,
      ),
    );

    expect(await p.capture(typed)).toEqual({
      kind: "refused",
      refusal: { kind: "capture-id-conflict", existing: item.id },
    });
  });
});

describe("an edit behind the head of a line", () => {
  it("is refused once the source has revised the item, and the line holds", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    await p.routing.markProcessed(item.id, "filed by hand");
    const first = revision(
      succeeded(
        await p.items.edit(item.id, upstream("from upstream", "v2"), PERSON),
      ),
    );

    expect(await p.items.edit(item.id, byHand("mine"), PERSON)).toEqual({
      kind: "refused",
      refusal: { kind: "not-head", head: first.id },
    });
    expect(succeeded(await reread(p, "from upstream"))).toMatchObject({
      kind: "already-captured",
      item: { id: first.id },
    });
  });

  it("is refused once the item has been continued, and the line holds", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));
    const continuation = succeeded(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    ).item;
    await p.routing.markProcessed(item.id, "filed by hand");

    expect(
      await p.items.edit(item.id, byHand("mine again", "edit-2"), PERSON),
    ).toEqual({
      kind: "refused",
      refusal: { kind: "not-head", head: continuation.id },
    });
    expect(succeeded(await reread(p, "rewritten upstream"))).toMatchObject({
      kind: "already-captured",
      item: { id: continuation.id },
    });
  });

  it("still amends an unprocessed item behind its continuation in place", async () => {
    const { pool: p } = pool();
    const item = await relayed(p);
    succeeded(await p.items.edit(item.id, byHand("as I meant it"), PERSON));
    succeeded(
      await reread(p, "rewritten upstream", {
        sourceItemId: `${UPSTREAM_ID}@v2`,
        continues: item.id,
      }),
    );

    expect(
      succeeded(
        await p.items.edit(item.id, byHand("and again", "edit-2"), PERSON),
      ).kind,
    ).toBe("amended");
  });
});
