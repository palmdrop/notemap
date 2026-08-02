import { describe, expect, it } from "vitest";

import { isWorkExpected, type EnrichmentState } from "./state.js";

describe("isWorkExpected", () => {
  it("expects work while an enrichment is queued, running or retrying", () => {
    const inFlight: EnrichmentState[] = [
      { kind: "pending" },
      { kind: "running" },
      { kind: "failed", attempts: 2 },
    ];

    for (const state of inFlight) {
      expect(isWorkExpected(state), state.kind).toBe(true);
    }
  });

  it("expects nothing further once an enrichment is done or cannot run", () => {
    const settled: EnrichmentState[] = [
      { kind: "done" },
      { kind: "unavailable" },
      { kind: "not-applicable" },
    ];

    for (const state of settled) {
      expect(isWorkExpected(state), state.kind).toBe(false);
    }
  });
});
