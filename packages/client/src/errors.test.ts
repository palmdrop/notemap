import { describe, expect, it } from "vitest";

import { readRefusal } from "./errors";

const unread = (issues?: unknown) =>
  readRefusal({ error: { code: "malformed-envelope", issues } }).message;

describe("a body the daemon could not read", () => {
  it("names the first field it reports, whatever the request was", () => {
    expect(unread([{ path: "/name", keyword: "minLength" }])).toBe(
      "name is empty",
    );
    expect(
      unread([
        { path: "/arguments/path", keyword: "required" },
        { path: "/name", keyword: "minLength" },
      ]),
    ).toBe("arguments.path is missing");
  });

  it("never says it was a capture", () => {
    expect(unread([{ path: "/name", keyword: "pattern" }])).toBe(
      "name is not something this daemon can read",
    );
    expect(unread([])).toBe("the app sent something this daemon cannot read");
    expect(unread()).toBe("the app sent something this daemon cannot read");
    expect(unread([{ path: "", keyword: "type" }])).toBe(
      "the app sent something this daemon cannot read",
    );
  });
});
