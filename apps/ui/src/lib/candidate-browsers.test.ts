import { describe, expect, it } from "vitest";

import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
import PathLine from "$components/routing/PathLine.svelte";

import { browserFor } from "./candidate-browsers";

describe("which control a field draws through", () => {
  it("is the typed line for a field marked as any part of a path", () => {
    expect(browserFor({ path: true })).toBe(PathLine);
    expect(browserFor({ path: "folders" })).toBe(PathLine);
    expect(browserFor({ path: "leaf" })).toBe(PathLine);
  });

  it("is the schema-driven browser for a field marked as no path", () => {
    expect(browserFor({})).toBe(CandidateBrowser);
  });
});
