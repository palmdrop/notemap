import { describe, expect, it } from "vitest";

import { sourceId, tagName, payloadTypeName, itemId } from "../testing/brands";
import {
  createTestPool,
  expectAlreadyCaptured,
  expectCaptured,
  expectOk,
  expectRefused,
  morningAt,
  scratchpad,
  text,
  textCapture,
  watchedFolder,
} from "../testing/pool-fixture";

describe("capture", () => {
  it("becomes an item carrying its source, that source's id for it, and the time the source captured it", async () => {
    const pool = createTestPool();

    const item = expectCaptured(
      expectOk(
        await pool.capture(
          textCapture({
            source: scratchpad,
            sourceItemId: "2026-08-03-0915",
            capturedAt: morningAt(15),
            text: "the conveyor belt, not the archive",
          }),
        ),
      ),
    );

    expect(item.source).toBe(scratchpad);
    expect(item.sourceItemId).toBe("2026-08-03-0915");
    expect(item.createdAt).toBe(morningAt(15));
    expect(item.payload).toEqual({
      type: text,
      content: { text: "the conveyor belt, not the archive" },
      metadata: {},
      assets: [],
    });
    expect(item.revisionOf).toBeUndefined();
    expect(item.contentUpdatedAt).toBeUndefined();
    expect(item.archived).toBeUndefined();
  });

  it("tells the caller a capture id it has seen before is already captured", async () => {
    const pool = createTestPool();
    const envelope = textCapture({
      id: itemId("0198c0de-7000-7000-8000-00000000cafe"),
      text: "captured while unreachable",
    });

    const first = expectCaptured(expectOk(await pool.capture(envelope)));
    const second = expectAlreadyCaptured(
      expectOk(await pool.capture(envelope)),
    );

    expect(second.matchedOn).toBe("id");
    expect(second.item.id).toBe(first.id);

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values.map((item) => item.id)).toEqual([first.id]);
  });

  it("mints an id for a source that supplies none, and knows the item again by its source identity", async () => {
    const pool = createTestPool();
    const envelope = textCapture({
      source: watchedFolder,
      sourceItemId: "inbox/2026-08-01-quote.md",
      text: "read once, read again",
    });

    const first = expectCaptured(expectOk(await pool.capture(envelope)));
    expect(first.id.length).toBeGreaterThan(0);

    const reread = expectAlreadyCaptured(
      expectOk(await pool.capture(envelope)),
    );
    expect(reread.matchedOn).toBe("source");
    expect(reread.item.id).toBe(first.id);

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values.map((item) => item.id)).toEqual([first.id]);
  });

  it("refuses a replay of a capture id whose content disagrees with the pool", async () => {
    const pool = createTestPool();
    const id = itemId("0198c0de-7000-7000-8000-0000000000f1");
    const first = expectCaptured(
      expectOk(
        await pool.capture(
          textCapture({ id, sourceItemId: "note-a", text: "as it entered" }),
        ),
      ),
    );

    const refusal = expectRefused(
      await pool.capture(
        textCapture({ id, sourceItemId: "note-a", text: "rewritten later" }),
      ),
    );

    expect(refusal).toEqual({
      kind: "capture-id-conflict",
      existing: first.id,
    });

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values).toHaveLength(1);
    expect(feed.values[0]?.payload.content).toEqual({ text: "as it entered" });
  });

  it("refuses a re-read of a source item whose content changed", async () => {
    const pool = createTestPool();
    const first = expectCaptured(
      expectOk(
        await pool.capture(
          textCapture({
            source: watchedFolder,
            sourceItemId: "inbox/quote.md",
            text: "as it entered",
          }),
        ),
      ),
    );

    const refusal = expectRefused(
      await pool.capture(
        textCapture({
          source: watchedFolder,
          sourceItemId: "inbox/quote.md",
          text: "edited outside notemap",
        }),
      ),
    );

    expect(refusal).toEqual({
      kind: "source-item-changed",
      existing: first.id,
    });

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values).toHaveLength(1);
    expect(feed.values[0]?.payload.content).toEqual({ text: "as it entered" });
  });

  it("attributes the tags a source already knows about to that source", async () => {
    const pool = createTestPool();

    const item = expectCaptured(
      expectOk(
        await pool.capture(
          textCapture({
            source: watchedFolder,
            capturedAt: morningAt(20),
            tags: [tagName("project/fiction-a"), tagName("kind/quote")],
          }),
        ),
      ),
    );

    expect(item.tags.map((tag) => tag.name)).toEqual([
      tagName("project/fiction-a"),
      tagName("kind/quote"),
    ]);
    for (const tag of item.tags) {
      expect(tag.by).toEqual({ kind: "source", source: watchedFolder });
      expect(tag.addedAt.length).toBeGreaterThan(0);
    }
  });

  it("refuses a capture from a source it has not been configured with", async () => {
    const pool = createTestPool();
    const stranger = sourceId("nowhere");

    const refusal = expectRefused(
      await pool.capture(textCapture({ source: stranger })),
    );

    expect(refusal).toEqual({ kind: "unknown-source", source: stranger });

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values).toEqual([]);
  });

  it("refuses a payload type it has not been configured with", async () => {
    const pool = createTestPool();
    const voice = payloadTypeName("voice");

    const refusal = expectRefused(
      await pool.capture(textCapture({ payloadType: voice })),
    );

    expect(refusal).toEqual({ kind: "unknown-payload-type", type: voice });

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values).toEqual([]);
  });

  it("refuses a payload that does not fit the schema of its type", async () => {
    const pool = createTestPool();

    const refusal = expectRefused(
      await pool.capture(textCapture({ content: { text: 42 } })),
    );

    expect(refusal.kind).toBe("payload-invalid");
    if (refusal.kind !== "payload-invalid") {
      expect.unreachable();
    }
    expect(refusal.issues.length).toBeGreaterThan(0);
    for (const issue of refusal.issues) {
      expect(typeof issue.path).toBe("string");
      expect(issue.keyword.length).toBeGreaterThan(0);
    }

    const feed = await pool.views.feed({ limit: 10 });
    expect(feed.values).toEqual([]);
  });

  it("records that the item was captured, by the source it came from", async () => {
    const pool = createTestPool();

    const item = expectCaptured(
      expectOk(
        await pool.capture(
          textCapture({ source: scratchpad, capturedAt: morningAt(30) }),
        ),
      ),
    );

    const actions = await pool.actions.forItem(item.id, { limit: 10 });
    const captured = actions.values.filter(
      (action) => action.kind === "captured",
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]?.subject).toBe(item.id);
    expect(captured[0]?.by).toEqual({ kind: "source", source: scratchpad });
  });

  it("records nothing for a capture it refused", async () => {
    const pool = createTestPool();

    expectRefused(
      await pool.capture(textCapture({ source: sourceId("nowhere") })),
    );

    const actions = await pool.actions.all({ limit: 10 });
    expect(actions.values).toEqual([]);
  });

  it("records nothing further for a capture that was already captured", async () => {
    const pool = createTestPool();
    const envelope = textCapture({
      id: itemId("0198c0de-7000-7000-8000-0000000000f2"),
    });

    const item = expectCaptured(expectOk(await pool.capture(envelope)));
    expectAlreadyCaptured(expectOk(await pool.capture(envelope)));

    const actions = await pool.actions.forItem(item.id, { limit: 10 });
    expect(
      actions.values.filter((action) => action.kind === "captured"),
    ).toHaveLength(1);
  });
});
