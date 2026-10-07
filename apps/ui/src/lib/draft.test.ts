import { describe, expect, it, vi } from "vitest";

import "$testing/dom";

import {
  clearDraft,
  heldFiles,
  holdFiles,
  onRestored,
  readDraft,
  restoreDraft,
  writeDraft,
} from "./draft";

const KEY = "notemap:draft";

describe("the capture draft", () => {
  it("is empty where nothing was written", () => {
    expect(readDraft()).toEqual({ text: "", tags: [] });
  });

  it("reads back what was written", () => {
    writeDraft({ text: "a thought", tags: ["idea", "route/inbox"] });

    expect(readDraft()).toEqual({
      text: "a thought",
      tags: ["idea", "route/inbox"],
    });
  });

  it("leaves nothing behind once cleared, or once emptied", () => {
    writeDraft({ text: "a thought", tags: [] });
    clearDraft();
    expect(localStorage.getItem(KEY)).toBeNull();

    writeDraft({ text: "a thought", tags: [] });
    writeDraft({ text: "", tags: [] });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ["garbage", "{not json"],
    ["the wrong shape", JSON.stringify({ text: 3, tags: "idea" })],
    ["tags that are not names", JSON.stringify({ text: "", tags: [1] })],
    ["a bare string", JSON.stringify("a thought")],
  ])("restores nothing from %s", (_, stored) => {
    localStorage.setItem(KEY, stored);

    expect(readDraft()).toEqual({ text: "", tags: [] });
  });

  it("keeps no draft of whitespace alone, which is nothing to come back to", () => {
    writeDraft({ text: "   \n ", tags: [] });

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readDraft()).toEqual({ text: "", tags: [] });
  });

  it("restores a tag once, however many times a hand-edited store names it", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ text: "a thought", tags: ["research", "research"] }),
    );

    expect(readDraft()).toEqual({ text: "a thought", tags: ["research"] });
  });

  it("holds the attachments in memory, and lets go of them with the rest", () => {
    const shot = new File(["bytes"], "shot.png", { type: "image/png" });
    holdFiles([shot]);
    expect(heldFiles()).toEqual([shot]);
    expect(localStorage.getItem(KEY)).toBeNull();

    clearDraft();
    expect(heldFiles()).toEqual([]);
  });

  it("does not throw where the store refuses the write", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => writeDraft({ text: "a thought", tags: [] })).not.toThrow();
    expect(readDraft()).toEqual({ text: "", tags: [] });
  });

  it("puts a capture back after what the box holds, and tells the box", () => {
    writeDraft({ text: "mine", tags: ["idea"] });
    const told = vi.fn();
    const stop = onRestored(told);

    expect(restoreDraft({ text: "refused", tags: ["idea", "later"] })).toBe(
      "restored",
    );
    stop();

    expect(readDraft()).toEqual({
      text: "mine\n\nrefused",
      tags: ["idea", "later"],
    });
    expect(told).toHaveBeenCalledOnce();
  });

  it("puts attachments back after the ones the box already holds", () => {
    const shot = new File(["bytes"], "shot.png", { type: "image/png" });
    const paper = new File(["%PDF"], "paper.pdf", { type: "application/pdf" });

    holdFiles([shot]);
    expect(restoreDraft({ text: "words", tags: [] }, [paper])).toBe("restored");

    expect(heldFiles()).toEqual([shot, paper]);
    expect(readDraft().text).toBe("words");
    clearDraft();
    expect(heldFiles()).toEqual([]);
  });

  it("says so where the store refused the words", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(restoreDraft({ text: "refused", tags: [] })).toBe("unwritable");
  });
});
