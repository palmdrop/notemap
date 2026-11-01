import type {
  EditEnvelope,
  FeedFilter,
  Item,
  Page,
  Pool,
  SourceId,
} from "@notemap/core";
import { tagFilter, wordsFilter } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  bytes,
  envelope,
  harness,
  tag,
  TEXT,
  upload,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };

const PERSON = { kind: "person" } as const;

const SHELL = "shell/web" as SourceId;

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

/** Captures, one a minute, in the order given. */
async function capturing(
  p: Pool,
  ...texts: readonly string[]
): Promise<Item[]> {
  const items: Item[] = [];
  for (const [at, text] of texts.entries()) {
    const id = `item-${String(at)}`;
    items.push(
      succeeded(
        await p.capture(
          envelope({
            id,
            sourceItemId: id,
            text,
            capturedAt: `2026-08-06T09:0${String(at)}:00.000Z`,
          }),
        ),
      ).item,
    );
  }
  return items;
}

function saying(words: string, more: FeedFilter = {}): FeedFilter {
  return { ...more, words: succeeded(wordsFilter(words)) };
}

const ids = (items: readonly Item[]) => items.map((item) => item.id);

describe("reading through words", () => {
  it("reads every term, inside words too, without regard to case or accents", async () => {
    const { pool: p } = pool();
    const [sweeper, cafe, both] = await capturing(
      p,
      "A sweeper for the hallway",
      "Pasta at the Café",
      "the café sweeps up",
    );

    expect(ids((await p.views.queue(ALL, saying("WEEP"))).values)).toEqual([
      sweeper?.id,
      both?.id,
    ]);
    expect(ids((await p.views.queue(ALL, saying("cafe"))).values)).toEqual([
      cafe?.id,
      both?.id,
    ]);
    expect(
      ids((await p.views.queue(ALL, saying("cafe  sweep"))).values),
    ).toEqual([both?.id]);
  });

  it("finds words in every script, one written without spaces too", async () => {
    const { pool: p } = pool();
    const [tokyo, hindi, greek] = await capturing(
      p,
      "東京で自転車を買った",
      "हिन्दी में विचार",
      "Καλημέρα κόσμε",
    );

    const read = async (words: string) =>
      ids((await p.views.feed(ALL, saying(words))).values);
    expect(await read("自転車")).toEqual([tokyo?.id]);
    expect(await read("विचार")).toEqual([hindi?.id]);
    expect(await read("καλημερα")).toEqual([greek?.id]);
    expect(await read("で")).toEqual([tokyo?.id]);
  });

  it("finds an item by the name of a file it carries", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const photo = await upload(p, "Hallway-Rack.png", bytes("png"));
    const carrying = succeeded(
      await p.capture(
        envelope({
          id: "item-1",
          sourceItemId: "item-1",
          text: "look",
          assets: [{ slot: "photo", asset: photo.id }],
        }),
      ),
    ).item;
    await capturing(p, "nothing here");

    expect(ids((await p.views.feed(ALL, saying("hallway"))).values)).toEqual([
      carrying.id,
    ]);
  });

  it("holds together with tags and states", async () => {
    const { pool: p } = pool();
    const [quoted, archived] = await capturing(
      p,
      "a bike rack, quoted",
      "a bike rack, archived",
      "a bike rack, nothing else",
    );
    await p.items.tag(quoted!.id, tag("kind/quote"), PERSON);
    await p.items.archive(archived!.id);

    const quote = succeeded(tagFilter(["kind/quote"]));
    expect(
      ids((await p.views.feed(ALL, saying("bike", { tags: quote }))).values),
    ).toEqual([quoted?.id]);
    expect(
      ids(
        (await p.views.feed(ALL, saying("rack", { states: ["archived"] })))
          .values,
      ),
    ).toEqual([archived?.id]);
    expect(ids((await p.views.archived(ALL, saying("rack"))).values)).toEqual([
      archived?.id,
    ]);
  });

  it("pages under the words, from the surface's own position", async () => {
    const { pool: p } = pool();
    const items = await capturing(
      p,
      "rack one",
      "other",
      "rack two",
      "other",
      "rack three",
    );

    const first = await p.views.queue({ limit: 2 }, saying("rack"));
    expect(ids(first.values)).toEqual([items[0]?.id, items[2]?.id]);
    if (first.next === undefined) throw new Error("expected more");

    const second = await p.views.queue(
      { limit: 2, after: first.next },
      saying("rack"),
    );
    expect(ids(second.values)).toEqual([items[4]?.id]);
    expect(second.next).toBeUndefined();
  });

  it("matches an item by its words as amended, and not as they were", async () => {
    const { pool: p, clock } = pool();
    const [item] = await capturing(p, "a bike rack");
    clock.set("2026-08-06T10:00:00.000Z");

    const edit: EditEnvelope = {
      source: SHELL,
      sourceItemId: "edit-1",
      payload: {
        type: TEXT,
        content: { text: "a shoe rack" },
        metadata: {},
        assets: [],
      },
    };
    expect(succeeded(await p.items.edit(item!.id, edit, PERSON)).kind).toBe(
      "amended",
    );

    expect(ids((await p.views.queue(ALL, saying("shoe"))).values)).toEqual([
      item?.id,
    ]);
    expect((await p.views.queue(ALL, saying("bike"))).values).toEqual([]);
  });
});
