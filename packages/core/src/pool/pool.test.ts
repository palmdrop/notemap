import { describe, expect, it } from "vitest";

import {
  createTestPool,
  expectCaptured,
  expectOk,
  morningAt,
  textCapture,
} from "../testing/pool-fixture";

// Skipped until the store slice lands and a Pool can be wired over it.
describe.skip("two pools in one process", () => {
  it("hold their items apart from each other", async () => {
    const one = createTestPool();
    const other = createTestPool();

    const mine = expectCaptured(
      expectOk(
        await one.capture(
          textCapture({ capturedAt: morningAt(5), text: "kept in one pool" }),
        ),
      ),
    );

    expect((await other.views.feed({ limit: 10 })).values).toEqual([]);
    expect(await other.items.get(mine.id)).toBeUndefined();

    const theirs = expectCaptured(
      expectOk(
        await other.capture(
          textCapture({ capturedAt: morningAt(6), text: "kept in the other" }),
        ),
      ),
    );

    expect(
      (await one.views.feed({ limit: 10 })).values.map((i) => i.id),
    ).toEqual([mine.id]);
    expect(
      (await other.views.feed({ limit: 10 })).values.map((i) => i.id),
    ).toEqual([theirs.id]);
  });
});
