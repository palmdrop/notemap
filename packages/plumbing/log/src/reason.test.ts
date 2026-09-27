import { describe, expect, it } from "vitest";

import { reasonOf } from "./reason";

describe("the reason something failed", () => {
  it("is the message where there is one cause", () => {
    expect(reasonOf(new Error("the pool refused it"))).toBe(
      "the pool refused it",
    );
  });

  it("is every message down the chain", () => {
    const cause = new Error("the pool could not be reached", {
      cause: new Error("fetch failed", { cause: new Error("ECONNREFUSED") }),
    });

    expect(reasonOf(cause)).toBe(
      "the pool could not be reached: fetch failed: ECONNREFUSED",
    );
  });

  it("says whatever was thrown where it was not an error", () => {
    expect(reasonOf("nope")).toBe("nope");
    expect(reasonOf(undefined)).toBe("undefined");
  });
});
