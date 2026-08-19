import type {
  Duration,
  Item,
  ItemId,
  Page,
  Pool,
  TagName,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { envelope, harness, itemRecord, tag, type Harness } from "./fixture";

const ALL: Page = { limit: 50 };
const KIND_QUOTE = tag("kind/quote");
const PERSON = { kind: "person" } as const;

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

async function captured(
  p: Pool,
  overrides: Parameters<typeof envelope>[0] = {},
): Promise<Item> {
  const id = overrides.id ?? "item-0";
  return succeeded(
    await p.capture(envelope({ sourceItemId: id, ...overrides, id })),
  ).item;
}

/** What the mirror is owed, taken rather than read, so the next call answers what came after. */
async function takeMirrorWork(p: Pool): Promise<readonly ItemId[]> {
  const leases = await p.work.claim({
    kinds: ["mirror"],
    limit: 50,
    leaseFor: 60_000 as Duration,
  });
  for (const lease of leases) {
    await p.work.complete(lease.id, { kind: "succeeded" });
  }

  return leases.flatMap((lease) =>
    lease.job.subject.kind === "item" ? [lease.job.subject.item] : [],
  );
}

const names = (item: Item) => item.tags.map((held) => held.name);

describe("tagging", () => {
  it("records the tag with the agent that added it and the time", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);
    opened.clock.set("2026-08-06T10:00:00.000Z");

    const tagged = succeeded(
      await p.items.tag(item.id, KIND_QUOTE, {
        kind: "provider",
        provider: "tagger" as never,
      }),
    );

    expect(tagged.tags).toEqual([
      {
        name: KIND_QUOTE,
        by: { kind: "provider", provider: "tagger" },
        addedAt: "2026-08-06T10:00:00.000Z",
      },
    ]);
    expect((await p.items.get(item.id))?.tags).toEqual(tagged.tags);
  });

  it("leaves the item in the queue, at its unchanged place", async () => {
    const { pool: p } = pool();
    const first = await captured(p);
    const second = await captured(p, {
      id: "item-1",
      capturedAt: "2026-08-06T09:01:00.000Z",
    });

    await p.items.tag(first.id, KIND_QUOTE, { kind: "person" });

    const queued = (await p.views.queue(ALL)).values.map((each) => each.id);
    expect(queued).toEqual([first.id, second.id]);
  });

  it("absorbs a tag the item already carries, keeping the first attribution", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);
    await p.items.tag(item.id, KIND_QUOTE, { kind: "person" });
    await takeMirrorWork(p);
    opened.clock.set("2026-08-06T11:00:00.000Z");

    const again = succeeded(
      await p.items.tag(item.id, KIND_QUOTE, {
        kind: "source",
        source: "watched-folder" as never,
      }),
    );

    expect(again.tags).toEqual([
      {
        name: KIND_QUOTE,
        by: { kind: "person" },
        addedAt: "2026-08-06T09:00:00.000Z",
      },
    ]);
    // Nothing changed, so nothing is owed and nothing is logged.
    expect(await takeMirrorWork(p)).toEqual([]);
    expect(
      (await p.actions.forItem(item.id, ALL)).values.filter(
        (action) => action.kind === "tagged",
      ),
    ).toHaveLength(1);
  });

  it("removes a tag, and absorbs the removal of one that is not there", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    await p.items.tag(item.id, KIND_QUOTE, { kind: "person" });

    const untagged = succeeded(
      await p.items.untag(item.id, KIND_QUOTE, PERSON),
    );
    expect(names(untagged)).toEqual([]);

    const again = succeeded(await p.items.untag(item.id, KIND_QUOTE, PERSON));
    expect(names(again)).toEqual([]);
    expect(
      (await p.actions.forItem(item.id, ALL)).values.filter(
        (action) => action.kind === "untagged",
      ),
    ).toHaveLength(1);
  });

  it("refuses an id no item has, either way round", async () => {
    const { pool: p } = pool();
    const missing = "nobody" as ItemId;

    expect(
      await p.items.tag(missing, KIND_QUOTE, { kind: "person" }),
    ).toMatchObject({
      kind: "refused",
      refusal: { kind: "no-such-item", item: missing },
    });
    expect(await p.items.untag(missing, KIND_QUOTE, PERSON)).toMatchObject({
      kind: "refused",
      refusal: { kind: "no-such-item", item: missing },
    });
  });

  it("refuses a superseded item, either way round", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    await p.items.tag(item.id, KIND_QUOTE, PERSON);
    await captured(p, { id: "item-1", capturedAt: "2026-08-06T09:01:00.000Z" });

    const outcome = succeeded(
      await p.items.edit(
        item.id,
        { ...item.payload, content: { text: "a second thought" } },
        PERSON,
      ),
    );
    if (outcome.kind !== "revised") throw new Error("expected a revision");

    const refusal = {
      kind: "refused",
      refusal: { kind: "item-superseded", by: outcome.revision.id },
    };
    expect(await p.items.tag(item.id, tag("kind/note"), PERSON)).toMatchObject(
      refusal,
    );
    expect(await p.items.untag(item.id, KIND_QUOTE, PERSON)).toMatchObject(
      refusal,
    );

    // The revision is where classification goes, and it still carries what it inherited.
    expect(
      names(
        succeeded(await p.items.untag(outcome.revision.id, KIND_QUOTE, PERSON)),
      ),
    ).toEqual([]);
  });

  it("trims a tag, so the same name is one tag however it is spelled", async () => {
    const { pool: p } = pool();
    const item = await captured(p);

    await p.items.tag(item.id, tag("  kind/quote  "), PERSON);
    const again = succeeded(await p.items.tag(item.id, KIND_QUOTE, PERSON));

    expect(names(again)).toEqual([KIND_QUOTE]);
    // Absorbed, so the untrimmed spelling matched what is stored.
    expect(
      succeeded(await p.items.untag(item.id, tag(" kind/quote"), PERSON)),
    ).toMatchObject({ tags: [] });
  });

  it("refuses a tag with nothing in it, either way round", async () => {
    const { pool: p } = pool();
    const item = await captured(p);

    for (const blank of ["", "   "]) {
      expect(await p.items.tag(item.id, tag(blank), PERSON)).toMatchObject({
        kind: "refused",
        refusal: { kind: "tag-invalid", tag: blank },
      });
      expect(await p.items.untag(item.id, tag(blank), PERSON)).toMatchObject({
        kind: "refused",
        refusal: { kind: "tag-invalid", tag: blank },
      });
    }
  });

  it("drops a blank tag a capture carried rather than losing the capture", async () => {
    const { pool: p } = pool();
    const item = await captured(p, { tags: ["  kind/quote ", "   "] });

    expect(names(item)).toEqual([KIND_QUOTE]);
  });

  it("records the agent that removed a tag, which need not be a person", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    await p.items.tag(item.id, KIND_QUOTE, PERSON);

    await p.items.untag(item.id, KIND_QUOTE, {
      kind: "provider",
      provider: "tagger" as never,
    });

    const logged = await p.actions.forItem(item.id, ALL);
    expect(
      logged.values.find((action) => action.kind === "untagged"),
    ).toMatchObject({ by: { kind: "provider", provider: "tagger" } });
  });

  it("leaves an action and a mirror job for each half", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);
    // Drains what the capture itself owed, so what is left is the tagging's.
    await takeMirrorWork(p);

    await p.items.tag(item.id, KIND_QUOTE, { kind: "person" });
    expect(await takeMirrorWork(p)).toEqual([item.id]);

    opened.clock.set("2026-08-06T10:00:00.000Z");
    await p.items.untag(item.id, KIND_QUOTE, PERSON);
    expect(await takeMirrorWork(p)).toEqual([item.id]);

    const logged = await p.actions.forItem(item.id, {
      limit: 50,
      order: "oldest-first",
    });
    expect(logged.values.map((action) => action.kind)).toEqual([
      "captured",
      "tagged",
      "untagged",
    ]);
    expect(logged.values[1]).toMatchObject({
      by: { kind: "person" },
      detail: { tag: KIND_QUOTE },
    });
    expect(logged.values[2]).toMatchObject({
      by: { kind: "person" },
      detail: { tag: KIND_QUOTE },
    });
  });

  it("carries a source's own tags into the mirror with their attribution", async () => {
    const { pool: p } = pool();
    const item = await captured(p, { tags: ["project/fiction-a"] });

    await p.items.tag(item.id, KIND_QUOTE, { kind: "person" });

    const record = await itemRecord(p, item.id);
    expect(record?.item.tags).toEqual([
      {
        name: KIND_QUOTE,
        by: { kind: "person" },
        addedAt: "2026-08-06T09:00:00.000Z",
      },
      {
        name: "project/fiction-a" as TagName,
        by: { kind: "source", source: "scratchpad" },
        addedAt: "2026-08-06T09:00:00.000Z",
      },
    ]);
  });
});
