import { describe, expect, it } from "vitest";

import { ANSWERED_KEPT, withBatch, type Batch } from "./batches";
import { emptyState } from "./state";

const answered = (id: string): Batch => ({
  id,
  action: { kind: "archive" },
  items: ["one"],
  outcomes: [],
});

describe("the batches a client holds", () => {
  it("lets go of the oldest answered batch past the limit", () => {
    let state = emptyState();
    for (let n = 0; n <= ANSWERED_KEPT; n += 1) {
      state = withBatch(state, answered(`b${String(n)}`));
    }

    expect(state.batches.size).toBe(ANSWERED_KEPT);
    expect(state.batches.has("b0")).toBe(false);
    expect(state.batches.has(`b${String(ANSWERED_KEPT)}`)).toBe(true);
  });

  it("holds a batch the pool has not answered, however many came after it", () => {
    let state = withBatch(emptyState(), {
      id: "waiting",
      action: { kind: "archive" },
      items: ["one"],
    });
    for (let n = 0; n <= ANSWERED_KEPT; n += 1) {
      state = withBatch(state, answered(`b${String(n)}`));
    }

    expect(state.batches.has("waiting")).toBe(true);
  });
});
