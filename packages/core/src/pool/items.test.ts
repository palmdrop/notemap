import { describe, expect, it } from "vitest";

import { itemId } from "../testing/brands";
import {
  createTestPool,
  expectCaptured,
  expectOk,
  morningAt,
  textCapture,
} from "../testing/pool-fixture";

// Skipped until the store slice lands and a Pool can be wired over it.
describe.skip("reading one item", () => {
  it("gives back the item that was captured", async () => {
    const pool = createTestPool();
    const captured = expectCaptured(
      expectOk(
        await pool.capture(
          textCapture({ capturedAt: morningAt(5), text: "worth keeping" }),
        ),
      ),
    );

    const read = await pool.items.get(captured.id);

    expect(read).toEqual(captured);
  });

  it("gives back nothing for an id that was never captured", async () => {
    const pool = createTestPool();

    const read = await pool.items.get(
      itemId("0198c0de-7000-7000-8000-00000000dead"),
    );

    expect(read).toBeUndefined();
  });
});
