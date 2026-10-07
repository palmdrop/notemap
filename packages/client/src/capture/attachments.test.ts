import { describe, expect, it } from "vitest";

import { anItem } from "../testing/pool";
import { attached, attachmentsIn } from "./attachments";

const payload = {
  type: "note",
  content: { text: "words" },
  metadata: {},
  assets: [],
};

const urlOf = (asset: string) => `pool:${asset}`;

describe("what an item carries", () => {
  it("is every asset in slot order, with what the pool says of each", () => {
    const item = anItem("one", {
      payload: {
        ...payload,
        assets: [
          { slot: "001", asset: "second" },
          { slot: "000", asset: "first" },
        ],
      },
      assets: [
        {
          id: "first",
          filename: "shot.png",
          mime: "image/png",
          blob: "b",
          bytes: 4,
        },
      ],
    });

    expect(attachmentsIn(item, new Map(), urlOf)).toEqual([
      {
        asset: "first",
        url: "pool:first",
        filename: "shot.png",
        mime: "image/png",
        bytes: 4,
      },
      { asset: "second", url: "pool:second" },
    ]);
  });

  it("is what this client holds of an asset the pool has not answered for", () => {
    const item = anItem("one", { payload: attached(payload, ["held"]) });
    const held = new Map([
      [
        "held",
        {
          mime: "application/pdf",
          filename: "paper.pdf",
          bytes: 9,
          url: "blob:x",
        },
      ],
    ]);

    expect(attachmentsIn(item, held, urlOf)).toEqual([
      {
        asset: "held",
        url: "pool:held",
        filename: "paper.pdf",
        mime: "application/pdf",
        bytes: 9,
      },
    ]);
  });

  it("reads a slot named before slots were numbered", () => {
    const item = anItem("one", {
      payload: { ...payload, assets: [{ slot: "image", asset: "old" }] },
    });

    expect(attachmentsIn(item, new Map(), urlOf)).toEqual([
      { asset: "old", url: "pool:old" },
    ]);
  });
});

describe("naming what a payload carries", () => {
  it("numbers every slot afresh, in the order given", () => {
    const before = {
      ...payload,
      assets: [
        { slot: "image", asset: "old" },
        { slot: "recording", asset: "kept" },
      ],
    };

    expect(attached(before, ["kept", "new"]).assets).toEqual([
      { slot: "000", asset: "kept" },
      { slot: "001", asset: "new" },
    ]);
  });

  it("names nothing for nothing, and leaves the words alone", () => {
    const emptied = attached(
      { ...payload, assets: [{ slot: "000", asset: "a" }] },
      [],
    );

    expect(emptied.assets).toEqual([]);
    expect(emptied.content).toEqual({ text: "words" });
  });
});
