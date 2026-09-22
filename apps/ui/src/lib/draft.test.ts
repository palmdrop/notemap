import { describe, expect, it, vi } from "vitest";

import "$testing/dom";

import {
  clearDraft,
  heldPicture,
  holdPicture,
  readDraft,
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

  it("holds the picture in memory, and lets go of it with the rest", () => {
    const shot = new File(["bytes"], "shot.png", { type: "image/png" });
    holdPicture(shot);
    expect(heldPicture()).toBe(shot);
    expect(localStorage.getItem(KEY)).toBeNull();

    clearDraft();
    expect(heldPicture()).toBeUndefined();
  });

  it("does not throw where the store refuses the write", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => writeDraft({ text: "a thought", tags: [] })).not.toThrow();
    expect(readDraft()).toEqual({ text: "", tags: [] });
  });
});
