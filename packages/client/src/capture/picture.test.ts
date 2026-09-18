import { describe, expect, it } from "vitest";

import { anItem } from "../testing/pool";
import { pictured, pictureIn } from "./picture";

const payload = {
  type: "note",
  content: { text: "words" },
  metadata: {},
  assets: [{ slot: "recording", asset: "asset-r" }],
};

describe("the picture in the shell's slot", () => {
  it("is read with what the pool says about it, where the item carries that", () => {
    const item = anItem("one", {
      payload: pictured(payload, "asset-p"),
      assets: [
        {
          id: "asset-p",
          filename: "shot.png",
          mime: "image/png",
          blob: "b",
          bytes: 4,
        },
      ],
    });

    expect(pictureIn(item)).toEqual({
      asset: "asset-p",
      filename: "shot.png",
      mime: "image/png",
    });
  });

  it("is the reference alone where the pool has not answered for it yet", () => {
    const item = anItem("one", { payload: pictured(payload, "asset-p") });

    expect(pictureIn(item)).toEqual({ asset: "asset-p" });
  });

  it("is nothing where the slot is empty, whatever else is attached", () => {
    expect(pictureIn(anItem("one", { payload }))).toBeUndefined();
  });
});

describe("putting a picture in the slot", () => {
  it("replaces what was there and leaves the other slots alone", () => {
    const once = pictured(payload, "asset-p");
    const twice = pictured(once, "asset-q");

    expect(twice.assets).toEqual([
      { slot: "recording", asset: "asset-r" },
      { slot: "image", asset: "asset-q" },
    ]);
  });

  it("empties the slot for nothing", () => {
    expect(pictured(pictured(payload, "asset-p"), undefined).assets).toEqual([
      { slot: "recording", asset: "asset-r" },
    ]);
  });
});
