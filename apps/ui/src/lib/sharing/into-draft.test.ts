import { File as NodeFile } from "node:buffer";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDraft,
  heldFiles,
  holdFiles,
  readDraft,
  writeDraft,
} from "$lib/draft";

import { holding, posted } from "$testing/shares";

import { holdShare, type Holding } from "./held";
import { shareIntoDraft } from "./into-draft";

let shares: Holding & { readonly size: () => number };

beforeEach(() => {
  shares = holding();
  vi.stubGlobal("caches", { open: () => Promise.resolve(shares) });
});

afterEach(() => {
  clearDraft();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const photo = () =>
  new NodeFile(["x"], "photo.jpg", { type: "image/jpeg" }) as unknown as File;

/** Lets the cache calls a draft change starts finish. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    await holdShare(posted({}, [photo() as never]), shares, "1");

    await shareIntoDraft();

    expect(heldFiles().map((file) => file.name)).toEqual(["photo.jpg"]);
  });

  it("takes two shares as two paragraphs", async () => {
    await holdShare(posted({ text: "one" }), shares, "1");
    await holdShare(posted({ text: "two" }), shares, "2");

    await shareIntoDraft();

    expect(readDraft().text).toBe("one\n\ntwo");
  });

  it("adds its words once, however often the page is drawn", async () => {
    await holdShare(posted({ text: "once" }), shares, "1");

    await shareIntoDraft();
    expect(await shareIntoDraft()).toBe("none");

    expect(readDraft().text).toBe("once");
  });

  it("keeps its files for a page drawn after this one, until they are sent", async () => {
    await holdShare(posted({ text: "look" }, [photo() as never]), shares, "1");
    await shareIntoDraft();

    // A new page: the draft's files were memory, and memory is gone.
    vi.resetModules();
    const again = await import("./into-draft");
    const draft = await import("$lib/draft");
    expect(await again.shareIntoDraft()).toBe("restored");
    expect(draft.heldFiles().map((file) => file.name)).toEqual(["photo.jpg"]);
    expect(draft.readDraft().text).toBe("look");

    draft.clearDraft();
    await settled();
    expect(await again.shareIntoDraft()).toBe("none");
    expect(shares.size()).toBe(0);
  });

  it("lets go of a shared file taken out of the draft", async () => {
    await holdShare(posted({}, [photo() as never]), shares, "1");
    await shareIntoDraft();

    holdFiles([]);
    await settled();

    expect(await shareIntoDraft()).toBe("none");
    expect(shares.size()).toBe(0);
  });

  it("keeps the share where the draft cannot be written, for the next time", async () => {
    await holdShare(
      posted({ text: "keep me" }, [photo() as never]),
      shares,
      "1",
    );
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });

    expect(await shareIntoDraft()).toBe("unwritable");
    expect(heldFiles()).toEqual([]);

    vi.restoreAllMocks();
    expect(await shareIntoDraft()).toBe("restored");
    expect(readDraft().text).toBe("keep me");
    expect(heldFiles().map((file) => file.name)).toEqual(["photo.jpg"]);
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
