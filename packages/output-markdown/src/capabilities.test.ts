import { describe, expect, it } from "vitest";

import type { CapabilityName } from "@notemap/core";

import { browsedBy } from "./capabilities";

const named = (name: string) => name as CapabilityName;

describe("what browsing a field offers, read off the schema", () => {
  it("offers folders for a field holding folders", () => {
    expect(browsedBy(named("create"), "directory")).toBe("directory");
    expect(browsedBy(named("place-assets"), "directory")).toBe("directory");
  });

  it("offers folders and notes for a field holding a whole path", () => {
    expect(browsedBy(named("append"), "path")).toBe("file");
    expect(browsedBy(named("create-or-append"), "path")).toBe("file");
  });

  it("offers nothing for a field that is not askable, or not there", () => {
    expect(browsedBy(named("create"), "filename")).toBeUndefined();
    expect(browsedBy(named("append"), "heading")).toBeUndefined();
    expect(browsedBy(named("nothing-declared"), "path")).toBeUndefined();
  });
});
