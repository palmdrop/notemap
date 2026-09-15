import { describe, expect, it } from "vitest";

import { activates, chord, writing } from "./keys";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

function aimed(init: KeyboardEventInit, target: EventTarget): KeyboardEvent {
  const event = keydown(init);
  Object.defineProperty(event, "target", { value: target });
  return event;
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

describe("whether the browser will click what has the focus", () => {
  it("is true for ⏎ and space on a control it activates", () => {
    const button = document.createElement("button");
    const link = document.createElement("a");
    const pressed = document.createElement("div");
    pressed.setAttribute("role", "button");

    for (const target of [button, link, pressed]) {
      expect(activates(aimed({ key: "Enter" }, target))).toBe(true);
    }
    expect(activates(aimed({ key: " " }, button))).toBe(true);
  });

  it("is false for any other key, and for anything else focused", () => {
    const button = document.createElement("button");
    expect(activates(aimed({ key: "j" }, button))).toBe(false);
    expect(
      activates(aimed({ key: "Enter" }, document.createElement("div"))),
    ).toBe(false);
  });
});
