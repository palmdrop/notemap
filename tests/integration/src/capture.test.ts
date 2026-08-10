import type { Item, ItemId, Page } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONFIG,
  envelope,
  harness,
  NOTE,
  SCRATCHPAD,
  TEXT,
  WATCHED_FOLDER,
  at,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };

const open: Harness[] = [];

function pool(...args: Parameters<typeof harness>): Harness {
  const opened = harness(...args);
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

/** Narrows an outcome the test asserts should have succeeded. */
function captured(
  result: Awaited<ReturnType<Harness["pool"]["capture"]>>,
): Item {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value.item;
}

describe("capturing", () => {
  it("puts the payload and the source's own identity into the pool", async () => {
    const { pool: p } = pool();

    const item = captured(
      await p.capture(envelope({ sourceItemId: "src-a", text: "a thought" })),
    );

    expect(item.source).toBe(SCRATCHPAD);
    expect(item.sourceItemId).toBe("src-a");
    expect(item.payload.type).toBe(TEXT);
    expect(item.payload.content).toEqual({ text: "a thought" });
    await expect(p.items.get(item.id)).resolves.toMatchObject({ id: item.id });
  });

  it("mints an id for a source that cannot remember one", async () => {
    const { pool: p } = pool();

    const item = captured(
      await p.capture(
        envelope({ source: WATCHED_FOLDER, sourceItemId: "notes/one.md" }),
      ),
    );

    expect(item.id).toBeTruthy();
    await expect(p.items.get(item.id)).resolves.toMatchObject({
      sourceItemId: "notes/one.md",
    });
  });

  it("keeps the id a client minted for itself", async () => {
    const { pool: p } = pool();

    const item = captured(await p.capture(envelope({ id: "client-1" })));

    expect(item.id).toBe("client-1");
  });

  it("takes its capture time from the source, not from arrival", async () => {
    const { pool: p, clock } = pool();
    clock.set("2026-08-06T15:00:00.000Z");

    const item = captured(
      await p.capture(envelope({ capturedAt: "2026-08-03T08:00:00.000Z" })),
    );

    expect(item.createdAt).toBe("2026-08-03T08:00:00.000Z");
  });

  it("attributes the tags a source already knew about to that source", async () => {
    const { pool: p } = pool();

    const item = captured(
      await p.capture(envelope({ tags: ["kind/quote", "project/fiction-a"] })),
    );

    // Order is the store's, not core's: nothing in the domain ranks tags.
    expect(item.tags.map((each) => each.name).sort()).toEqual([
      "kind/quote",
      "project/fiction-a",
    ]);
    expect(item.tags).toSatisfy((tags: typeof item.tags) =>
      tags.every(
        (each) =>
          each.addedAt === "2026-08-06T09:00:00.000Z" &&
          each.by.kind === "source" &&
          each.by.source === SCRATCHPAD,
      ),
    );
  });

  it("writes the entry recording it, timed by arrival", async () => {
    const { pool: p, clock } = pool();
    clock.set("2026-08-06T15:00:00.000Z");

    const item = captured(
      await p.capture(envelope({ capturedAt: "2026-08-03T08:00:00.000Z" })),
    );
    const { values } = await p.actions.forItem(item.id, ALL);

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      kind: "captured",
      subject: item.id,
      by: { kind: "source", source: SCRATCHPAD },
      at: "2026-08-06T15:00:00.000Z",
    });
  });
});

describe("submitting the same capture twice", () => {
  it("produces exactly one item, matched on the id the client replayed", async () => {
    const { pool: p } = pool();
    const replayed = envelope({ id: "client-1" });

    const first = await p.capture(replayed);
    const second = await p.capture(replayed);

    expect(second).toMatchObject({
      kind: "ok",
      value: { kind: "already-captured", matchedOn: "id" },
    });
    expect(captured(second).id).toBe(captured(first).id);
    await expect(p.views.feed(ALL)).resolves.toMatchObject({
      values: [{ id: "client-1" }],
    });
  });

  it("matches on the source's identity when no id was supplied", async () => {
    const { pool: p } = pool();
    const reread = envelope({
      source: WATCHED_FOLDER,
      sourceItemId: "notes/one.md",
    });

    const first = await p.capture(reread);
    const second = await p.capture(reread);

    expect(second).toMatchObject({
      kind: "ok",
      value: { kind: "already-captured", matchedOn: "source" },
    });
    expect(captured(second).id).toBe(captured(first).id);
    await expect(p.views.feed(ALL)).resolves.toMatchObject({
      values: [{ id: captured(first).id }],
    });
  });

  it("does not enqueue a second mirror job", async () => {
    const { pool: p, ids } = pool();
    const replayed = envelope({ id: "client-1" });

    await p.capture(replayed);
    const afterFirst = ids.issued();
    await p.capture(replayed);

    expect(ids.issued()).toBe(afterFirst);
  });

  it("does not write a second entry in the log", async () => {
    const { pool: p } = pool();
    const replayed = envelope({ id: "client-1" });

    await p.capture(replayed);
    await p.capture(replayed);

    await expect(
      p.actions.forItem("client-1" as ItemId, ALL),
    ).resolves.toMatchObject({ values: [{ kind: "captured" }] });
  });

  it("ignores a difference in how the capture time was spelled", async () => {
    const { pool: p } = pool();
    await p.capture(
      envelope({ id: "client-1", capturedAt: "2026-08-06T09:00:00.000Z" }),
    );

    const again = await p.capture(
      envelope({ id: "client-1", capturedAt: "2026-08-06T09:00:00Z" }),
    );

    expect(again).toMatchObject({ kind: "ok" });
  });
});

describe("resubmitting under an identity that already exists", () => {
  it("refuses content that differs, under the capture id", async () => {
    const { pool: p } = pool();
    await p.capture(envelope({ id: "client-1", text: "a thought" }));

    const conflicting = await p.capture(
      envelope({ id: "client-1", text: "a different thought" }),
    );

    expect(conflicting).toEqual({
      kind: "refused",
      refusal: { kind: "capture-id-conflict", existing: "client-1" },
    });
  });

  it("refuses content that differs, under the source identity", async () => {
    const { pool: p } = pool();
    const first = captured(
      await p.capture(
        envelope({
          source: WATCHED_FOLDER,
          sourceItemId: "notes/one.md",
          text: "as written",
        }),
      ),
    );

    const changed = await p.capture(
      envelope({
        source: WATCHED_FOLDER,
        sourceItemId: "notes/one.md",
        text: "edited outside notemap",
      }),
    );

    expect(changed).toEqual({
      kind: "refused",
      refusal: { kind: "source-item-changed", existing: first.id },
    });
  });

  it("leaves the pool as it was", async () => {
    const { pool: p } = pool();
    await p.capture(envelope({ id: "client-1", text: "a thought" }));

    await p.capture(envelope({ id: "client-1", text: "a different thought" }));

    const { values } = await p.views.feed(ALL);
    expect(values).toHaveLength(1);
    expect(values[0]?.payload.content).toEqual({ text: "a thought" });
    await expect(
      p.actions.forItem("client-1" as ItemId, ALL),
    ).resolves.toMatchObject({ values: [{ kind: "captured" }] });
  });
});

describe("a source core has never been told about", () => {
  it("captures like any other, and is attributed to itself", async () => {
    const { pool: p } = pool();

    const item = captured(
      await p.capture(envelope({ source: "nowhere" as typeof SCRATCHPAD })),
    );

    expect(item.source).toBe("nowhere");
    await expect(p.views.feed(ALL)).resolves.toMatchObject({
      values: [{ id: item.id }],
    });
  });

  it("carries no policy, which is the whole of what declaring one buys", async () => {
    const { pool: p } = pool();

    const item = captured(
      await p.capture(
        envelope({
          source: "nowhere" as typeof SCRATCHPAD,
          tags: ["kind/note"],
        }),
      ),
    );

    // The only policy a source carries today is `autoRequest`, and there are no
    // enrichments configured for it to name, so what is asserted here is that
    // an undeclared source is not a lesser capture: its tags are attributed to
    // it exactly as a declared source's are.
    expect(item.tags).toEqual([
      expect.objectContaining({ by: { kind: "source", source: "nowhere" } }),
    ]);
  });
});

describe("a capture core will not accept", () => {
  it("names the payload type it does not know", async () => {
    const { pool: p } = pool();
    const unknown = {
      ...envelope(),
      payload: { ...envelope().payload, type: "video" as typeof TEXT },
    };

    await expect(p.capture(unknown)).resolves.toEqual({
      kind: "refused",
      refusal: { kind: "unknown-payload-type", type: "video" },
    });
  });

  it("reports where the payload failed its schema", async () => {
    const { pool: p } = pool();
    const malformed = {
      ...envelope(),
      payload: { ...envelope().payload, content: { text: 7 } },
    };

    await expect(p.capture(malformed)).resolves.toEqual({
      kind: "refused",
      refusal: {
        kind: "payload-invalid",
        issues: [{ path: "/text", keyword: "type" }],
      },
    });
  });

  it("names the asset slot its payload type requires", async () => {
    const { pool: p } = pool();
    const slotless = {
      ...envelope(),
      payload: {
        type: NOTE,
        content: { body: "spoken" },
        metadata: {},
        assets: [],
      },
    };

    await expect(p.capture(slotless)).resolves.toEqual({
      kind: "refused",
      refusal: { kind: "missing-asset-slot", slot: "recording" },
    });
  });

  it("writes nothing at all", async () => {
    const { pool: p } = pool();

    await p.capture({
      ...envelope(),
      payload: { ...envelope().payload, type: "video" as typeof TEXT },
    });

    await expect(p.views.feed(ALL)).resolves.toEqual({ values: [] });
    await expect(p.actions.all(ALL)).resolves.toEqual({ values: [] });
  });
});

describe("the feed", () => {
  it("places a capture at its source's time, not at its arrival", async () => {
    const { pool: p } = pool();
    await p.capture(
      envelope({
        id: "a",
        sourceItemId: "a",
        capturedAt: at("2026-08-01T09:00:00.000Z"),
      }),
    );
    await p.capture(
      envelope({
        id: "b",
        sourceItemId: "b",
        capturedAt: at("2026-08-05T09:00:00.000Z"),
      }),
    );
    // Written last, captured three days before b: an offline note, synced late.
    await p.capture(
      envelope({
        id: "c",
        sourceItemId: "c",
        capturedAt: at("2026-08-02T09:00:00.000Z"),
      }),
    );

    const { values } = await p.views.feed({ ...ALL, order: "oldest-first" });

    expect(values.map((item) => item.id)).toEqual(["a", "c", "b"]);
  });

  it("reads newest first when the caller says nothing", async () => {
    const { pool: p } = pool();
    await p.capture(
      envelope({
        id: "a",
        sourceItemId: "a",
        capturedAt: at("2026-08-01T09:00:00.000Z"),
      }),
    );
    await p.capture(
      envelope({
        id: "b",
        sourceItemId: "b",
        capturedAt: at("2026-08-05T09:00:00.000Z"),
      }),
    );

    const { values } = await p.views.feed(ALL);

    expect(values.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("paginates without repeating or dropping", async () => {
    const { pool: p } = pool();
    for (let index = 0; index < 5; index++) {
      await p.capture(
        envelope({
          id: `item-${index}`,
          sourceItemId: `src-${index}`,
          capturedAt: at(`2026-08-0${index + 1}T09:00:00.000Z`),
        }),
      );
    }

    const seen: string[] = [];
    let page = await p.views.feed({ limit: 2, order: "oldest-first" });
    seen.push(...page.values.map((item) => item.id));
    while (page.next !== undefined) {
      page = await p.views.feed({
        limit: 2,
        order: "oldest-first",
        after: page.next,
      });
      seen.push(...page.values.map((item) => item.id));
    }

    expect(seen).toEqual(["item-0", "item-1", "item-2", "item-3", "item-4"]);
  });
});

describe("two pools in one process", () => {
  it("share nothing", async () => {
    const { pool: first } = pool();
    const { pool: second } = pool(CONFIG);

    await first.capture(envelope({ id: "only-in-first" }));

    await expect(first.views.feed(ALL)).resolves.toMatchObject({
      values: [{ id: "only-in-first" }],
    });
    await expect(second.views.feed(ALL)).resolves.toEqual({ values: [] });
  });
});
