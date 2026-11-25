import { File as NodeFile } from "node:buffer";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { heldFiles, readDraft, writeDraft } from "$lib/draft";

import { holding, posted } from "$testing/shares";

import { holdShare, type Holding } from "./held";
import { shareIntoDraft } from "./into-draft";

let shares: Holding;

beforeEach(() => {
  shares = holding();
  vi.stubGlobal("caches", { open: () => Promise.resolve(shares) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a share taken into the draft", () => {
  it("is the draft, where there was none", async () => {
    await holdShare(posted({ text: "shared words" }), shares, "1");

    expect(await shareIntoDraft()).toBe("restored");
    expect(readDraft().text).toBe("shared words");
  });

  it("goes after what was written, and overwrites none of it", async () => {
    writeDraft({ text: "half a thought", tags: ["later"] });
    await holdShare(posted({ url: "https://example.org" }), shares, "1");

    await shareIntoDraft();

    expect(readDraft()).toEqual({
      text: "half a thought\n\nhttps://example.org",
      tags: ["later"],
    });
  });

  it("adds what it brought to the files held", async () => {
    await holdShare(
      posted({}, [new NodeFile(["x"], "photo.jpg", { type: "image/jpeg" })]),
      shares,
      "1",
    );

    await shareIntoDraft();

    expect(heldFiles().map((file) => file.name)).toEqual(["photo.jpg"]);
  });

  it("takes two shares as two paragraphs", async () => {
    await holdShare(posted({ text: "one" }), shares, "1");
    await holdShare(posted({ text: "two" }), shares, "2");

    await shareIntoDraft();

    expect(readDraft().text).toBe("one\n\ntwo");
  });

  it("says nothing was held where nothing was", async () => {
    expect(await shareIntoDraft()).toBe("none");
    expect(readDraft().text).toBe("");
  });

  it("says nothing was held where the browser keeps nothing", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("caches", undefined);

    expect(await shareIntoDraft()).toBe("none");
  });
});
