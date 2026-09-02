import { describe, expect, it } from "vitest";

import { assetName, oneSegment } from "./names";

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

describe("what an asset is called beside a note", () => {
  const BLOB = "3f9a1c22e8b40d17".padEnd(64, "0");

  /** The digest goes before the extension, so the vault still sorts and opens it. */
  it("keeps the uploaded name and carries the content's digest", () => {
    expect(assetName("holiday.png", BLOB, "asset-1")).toBe(
      "holiday-3f9a1c22.png",
    );
    expect(assetName("recording.m4a", BLOB, "asset-1")).toBe(
      "recording-3f9a1c22.m4a",
    );
  });

  /**
   * The whole point: a delivery retried after placing an asset computes the
   * same name, so it lands on the copy it already wrote rather than beside it.
   */
  it("is the same name for the same bytes, every time", () => {
    expect(assetName("holiday.png", BLOB, "a")).toBe(
      assetName("holiday.png", BLOB, "b"),
    );
  });

  it("is a different name for different bytes under one uploaded name", () => {
    expect(assetName("holiday.png", BLOB, "a")).not.toBe(
      assetName("holiday.png", "b".repeat(64), "a"),
    );
  });

  it("falls back where the uploaded name leaves nothing", () => {
    expect(assetName("..", BLOB, "asset-1")).toBe("asset-1-3f9a1c22");
    expect(assetName("", BLOB, "asset-1")).toBe("asset-1-3f9a1c22");
  });

  it("flattens a name that was never a name", () => {
    expect(assetName("../../authorized_keys", BLOB, "a")).toBe(
      "authorized_keys-3f9a1c22",
    );
  });
});
