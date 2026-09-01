import { describe, expect, it } from "vitest";

import { alternatives, oneSegment } from "./names";

describe("one segment", () => {
  it("flattens a name that was never a name", () => {
    expect(oneSegment("../../authorized_keys", "fallback")).toBe(
      "authorized_keys",
    );
    expect(oneSegment("a/b/c.png", "fallback")).toBe("a b c.png");
  });

  it("falls back where nothing survives", () => {
    expect(oneSegment("..", "fallback")).toBe("fallback");
    expect(oneSegment("   ", "fallback")).toBe("fallback");
    expect(oneSegment("", "fallback")).toBe("fallback");
    expect(oneSegment("###", "fallback")).toBe("fallback");
  });

  it("drops the markers a heading or a bullet begins with", () => {
    expect(oneSegment("# A thought", "fallback")).toBe("A thought");
    expect(oneSegment("## A thought", "fallback")).toBe("A thought");
    expect(oneSegment("- a bullet", "fallback")).toBe("a bullet");
    expect(oneSegment("> a quote", "fallback")).toBe("a quote");
  });

  /** Only the ends: a dash between words is somebody's name for the thing. */
  it("leaves a dash alone in the middle of a name", () => {
    expect(oneSegment("a-thought.md", "fallback")).toBe("a-thought.md");
    expect(oneSegment("Read: Borges", "fallback")).toBe("Read- Borges");
  });

  it("keeps letters of any script, because a filename is the user's", () => {
    expect(oneSegment("Ölandsbron.md", "fallback")).toBe("Ölandsbron.md");
    expect(oneSegment("メモ.md", "fallback")).toBe("メモ.md");
  });
});

describe("alternatives", () => {
  it("keeps the extension while suffixing the stem", () => {
    const [first, second, third] = alternatives("photo.png");
    expect([first, second, third]).toEqual([
      "photo.png",
      "photo-1.png",
      "photo-2.png",
    ]);
  });

  it("suffixes a name with no extension at the end", () => {
    const [, second] = alternatives("README");
    expect(second).toBe("README-1");
  });
});
