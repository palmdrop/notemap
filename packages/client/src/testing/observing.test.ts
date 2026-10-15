import { describe, expect, it } from "vitest";

import { until } from "./observing";

describe("waiting on an effect", () => {
  it("returns as soon as it has happened", async () => {
    let turns = 0;
    await until(() => ++turns > 2);

    expect(turns).toBe(3);
  });

  it("says so rather than carrying on where it never happens", async () => {
    await expect(until(() => false, 10)).rejects.toThrow(/never happened/);
  });
});
