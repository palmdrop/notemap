import { describe, expect, it } from "vitest";

import { headOf, keptWord, lineSourceOf } from "./lines";
import type { PoolReads } from "#types/api/ports";
import type {
  AssetId,
  ItemId,
  PayloadTypeName,
  SourceId,
  Timestamp,
} from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { Payload } from "#types/domain/payload";

const at = "2026-10-20T09:00:00.000Z" as Timestamp;

function text(value: string, assets: Payload["assets"] = []): Payload {
  return {
    type: "text" as PayloadTypeName,
    content: { text: value },
    metadata: {},
    assets,
  };
}

function anItem(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id: id as ItemId,
    source: "upstream" as SourceId,
    sourceItemId: id,
    payload: text(id),
    tags: [],
    createdAt: at,
    modifiedAt: at,
    revisedInto: [],
    ...overrides,
  };
}

/** Only the two reads a line is walked with; anything else is a test asking for more than it should. */
function reading(
  items: readonly Item[],
  continuations: Readonly<Record<string, string>> = {},
): PoolReads {
  const byId = new Map(items.map((item) => [item.id as string, item]));
  return {
    item: (id: ItemId) => Promise.resolve(byId.get(id)),
    continuationOf: (id: ItemId) => {
      const next = continuations[id];
      return Promise.resolve(next === undefined ? undefined : byId.get(next));
    },
  } as unknown as PoolReads;
}

describe("the head of a line", () => {
  it("is the item itself while nothing follows it", async () => {
    const one = anItem("one");
    expect((await headOf(reading([one]), one)).id).toBe("one");
  });

  it("is the latest revision, followed down", async () => {
    const one = anItem("one", {
      revisedInto: ["old" as ItemId, "two" as ItemId],
    });
    const old = anItem("old");
    const two = anItem("two", { revisedInto: ["three" as ItemId] });
    const three = anItem("three");

    expect((await headOf(reading([one, old, two, three]), one)).id).toBe(
      "three",
    );
  });

  it("follows a continuation, and the revisions made from it", async () => {
    const one = anItem("one");
    const next = anItem("next", { revisedInto: ["last" as ItemId] });
    const last = anItem("last");

    expect(
      (await headOf(reading([one, next, last], { one: "next" }), one)).id,
    ).toBe("last");
  });
});

describe("the source of a line", () => {
  it("is the first item's, not that of whoever revised it", async () => {
    const one = anItem("one");
    const two = anItem("two", {
      source: "shell" as SourceId,
      revisionOf: "one" as ItemId,
    });
    const three = anItem("three", {
      source: "shell" as SourceId,
      revisionOf: "two" as ItemId,
    });

    expect(await lineSourceOf(reading([one, two, three]), three)).toBe(
      "upstream",
    );
  });
});

describe("the source's word an item keeps", () => {
  it("is none once the source itself has said something", () => {
    const edited = anItem("one", { sourceWord: text("from upstream") });
    expect(keptWord(edited, text("anything"), true)).toBeUndefined();
  });

  it("is what the item said, the first time somebody else edits it", () => {
    expect(keptWord(anItem("one"), text("mine"), false)).toEqual(text("one"));
  });

  it("stays what the source said through a second edit by somebody else", () => {
    const edited = anItem("one", {
      payload: text("mine"),
      sourceWord: text("from upstream"),
    });
    expect(keptWord(edited, text("mine again"), false)).toEqual(
      text("from upstream"),
    );
  });

  it("is none where the edit writes the source's words back", () => {
    const edited = anItem("one", {
      payload: text("mine"),
      sourceWord: text("from upstream"),
    });
    expect(keptWord(edited, text("from upstream"), false)).toBeUndefined();
  });

  it("is compared and kept in slot order, which carries no meaning", () => {
    const picture = (slot: string) => ({ slot, asset: slot as AssetId });
    const said = text("from upstream", [picture("001"), picture("000")]);
    const edited = anItem("one", { payload: text("mine"), sourceWord: said });

    expect(
      keptWord(
        edited,
        text("from upstream", [picture("000"), picture("001")]),
        false,
      ),
    ).toBeUndefined();
    expect(keptWord(edited, text("mine again"), false)?.assets).toEqual([
      picture("000"),
      picture("001"),
    ]);
  });
});
