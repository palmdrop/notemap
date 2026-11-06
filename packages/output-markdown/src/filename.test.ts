import { describe, expect, it } from "vitest";

import { filenameFrom } from "./filename";

const named = (content: unknown) => filenameFrom(content, "item-1");

describe("what a note nobody named is called", () => {
  it("is the first line, lower-cased, a dash between its words", () => {
    expect(named("pasta from Lena's")).toBe("pasta-from-lenas.md");
  });

  it("ends at the last word that fits in 40 characters", () => {
    expect(
      named("idea: a bike rack that folds flat into the hallway wall"),
    ).toBe("idea-a-bike-rack-that-folds-flat-into.md");
  });

  it("reads the first line that says anything", () => {
    expect(named("\n\n  # A heading\nthe body")).toBe("a-heading.md");
  });

  it("reads the longest string, wherever it is held", () => {
    expect(named({ url: "x", text: "a longer thought\nmore" })).toBe(
      "a-longer-thought.md",
    );
  });

  it("makes a link one run of words", () => {
    expect(named("https://example.com/a/b?c=d")).toBe(
      "https-example-com-a-b-c-d.md",
    );
  });

  it("keeps a script whose vowels are marks", () => {
    expect(named("हिन्दी में विचार")).toBe("हिन्दी-में-विचार.md");
  });

  it("is the same name however a letter was encoded", () => {
    expect(named("Café notes")).toBe(named("Café notes"));
    expect(named("Café notes")).toBe("café-notes.md");
  });

  it("ends between words in a script written without spaces", () => {
    const stem = named("東京で自転車を買った".repeat(6)).slice(0, -3);
    expect([...stem].length).toBeLessThanOrEqual(40);
    expect("東京で自転車を買った".repeat(6).startsWith(stem)).toBe(true);
  });

  it("never splits a letter outside the basic plane", () => {
    const stem = named("𝒳".repeat(50)).slice(0, -3);
    expect(stem).toBe("𝒳".repeat(40));
  });

  it("cuts a first word longer than the budget", () => {
    expect(named("a".repeat(50))).toBe(`${"a".repeat(40)}.md`);
  });

  it("is the item's id where nothing nameable is said", () => {
    expect(named("")).toBe("item-1.md");
    expect(named("#!?")).toBe("item-1.md");
    expect(named({ blob: 3 })).toBe("item-1.md");
  });
});
