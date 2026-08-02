import { describe, expect, it } from "vitest";

import { isWorkExpected, type StepState } from "./step-state.js";

describe("isWorkExpected", () => {
  it("expects work while a step is queued, running or retrying", () => {
    const inFlight: StepState[] = [
      { kind: "pending" },
      { kind: "running" },
      { kind: "failed", attempts: 2 },
    ];

    for (const state of inFlight) {
      expect(isWorkExpected(state), state.kind).toBe(true);
    }
  });

  it("expects nothing further once a step is done or cannot run", () => {
    const settled: StepState[] = [
      { kind: "done" },
      { kind: "unavailable" },
      { kind: "not-applicable" },
    ];

    for (const state of settled) {
      expect(isWorkExpected(state), state.kind).toBe(false);
    }
  });
});
