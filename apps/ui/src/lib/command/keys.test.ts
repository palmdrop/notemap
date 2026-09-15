import { afterEach, describe, expect, it, vi } from "vitest";

import { chord, reads, writing } from "./keys";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("the chord a keydown is", () => {
  it("is the character itself for a shifted letter, shift never named beside it", () => {
    expect(chord(keydown({ key: "D", shiftKey: true }))).toBe("D");
  });

  it("is the character itself for punctuation typed with shift", () => {
    expect(chord(keydown({ key: "+", shiftKey: true }))).toBe("+");
  });

  it("names mod on a named key, from either physical key", () => {
    expect(chord(keydown({ key: "Enter", metaKey: true }))).toBe("mod+enter");
    expect(chord(keydown({ key: "Enter", ctrlKey: true }))).toBe("mod+enter");
  });

  it("names shift on a named key", () => {
    expect(chord(keydown({ key: "Tab", shiftKey: true }))).toBe("shift+tab");
  });

  it("is the lowercased name alone for a plain named key", () => {
    expect(chord(keydown({ key: "Escape" }))).toBe("escape");
  });

  it("carries alt as its own prefix, so an alt combination binds nothing", () => {
    expect(chord(keydown({ key: "d", altKey: true }))).toBe("alt+d");
  });
});

describe("reading a chord back", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves an unnamed character alone", () => {
    expect(reads("d")).toBe("d");
    expect(reads("+")).toBe("+");
  });

  it("names mod and the key it is combined with", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "(Windows NT 10.0)",
    );
    expect(reads("mod+enter")).toBe("Ctrl+⏎");
  });

  it("reads mod as the platform's own symbol on a mac, run together", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Macintosh");
    expect(reads("mod+enter")).toBe("⌘⏎");
  });
});

describe("whether a key was pressed while writing", () => {
  it("is true for an input, a textarea and anything contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const edited = document.createElement("div");
    Object.defineProperty(edited, "isContentEditable", { value: true });

    expect(writing(input)).toBe(true);
    expect(writing(textarea)).toBe(true);
    expect(writing(edited)).toBe(true);
  });

  it("is false for anything else, including nothing at all", () => {
    expect(writing(document.createElement("div"))).toBe(false);
    expect(writing(null)).toBe(false);
  });
});
