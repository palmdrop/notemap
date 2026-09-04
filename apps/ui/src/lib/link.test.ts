import { describe, expect, it } from "vitest";

import { followable } from "./link";

describe("a link a destination offered", () => {
  it("follows http and https", () => {
    expect(followable("https://vault.example/a.md")).toBe(
      "https://vault.example/a.md",
    );
    expect(followable("http://vault.local/a.md")).toBe(
      "http://vault.local/a.md",
    );
  });

  it("refuses a scheme that would run on this origin", () => {
    expect(followable("javascript:alert(1)")).toBeUndefined();
    expect(followable("data:text/html,<script>")).toBeUndefined();
  });

  it("refuses what is not a URL, and an absent one", () => {
    expect(followable("inbox/a-thought.md")).toBeUndefined();
    expect(followable(undefined)).toBeUndefined();
  });
});
