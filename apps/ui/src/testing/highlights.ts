import { onTestFinished, vi } from "vitest";

/**
 * A highlight registry where jsdom has none, for the rest of the test. Reads
 * back the ranges the search's highlight holds.
 */
export function registering(): () => readonly Range[] {
  const registry = new Map<string, Set<Range>>();
  vi.stubGlobal("CSS", { highlights: registry });
  vi.stubGlobal("Highlight", Set);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return () => [...(registry.get("search") ?? [])];
}

/** The text each range covers. */
export function said(ranges: readonly Range[]): readonly string[] {
  return ranges.map((range) => range.toString());
}
