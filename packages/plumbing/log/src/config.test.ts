import { describe, expect, it } from "vitest";

import { levelFrom } from "./config";

describe("a level named in the environment", () => {
  it("is the level it names", () => {
    expect(levelFrom("NOTEMAP_LOG_LEVEL", { NOTEMAP_LOG_LEVEL: "debug" })).toBe(
      "debug",
    );
  });

  it("is nothing where the variable is unset or empty", () => {
    expect(levelFrom("NOTEMAP_LOG_LEVEL", {})).toBeUndefined();
    expect(
      levelFrom("NOTEMAP_LOG_LEVEL", { NOTEMAP_LOG_LEVEL: "" }),
    ).toBeUndefined();
  });

  it("is refused where it names no level, by the variable's own name", () => {
    expect(() =>
      levelFrom("NOTEMAP_RELAY_ARENA_LOG_LEVEL", {
        NOTEMAP_RELAY_ARENA_LOG_LEVEL: "loud",
      }),
    ).toThrow(/NOTEMAP_RELAY_ARENA_LOG_LEVEL is "loud"/);
  });
});
