import { describe, expect, it } from "vitest";

import { placeOf } from "./place";

describe("where a typed path lands", () => {
  it("reads a trailing slash as a folder, with the name to be derived", () => {
    expect(placeOf("projects/notemap/drafts/")).toEqual({
      directory: "projects/notemap/drafts",
    });
  });

  it("reads a path without one as naming the note itself", () => {
    expect(placeOf("projects/notemap/notes/decisions.md")).toEqual({
      directory: "projects/notemap/notes",
      filename: "decisions.md",
    });
  });

  /** The whole reason the slash is not decoration. */
  it("tells a new folder from a new extensionless note by it alone", () => {
    expect(placeOf("drafts/")).toEqual({ directory: "drafts" });
    expect(placeOf("drafts")).toEqual({ directory: "", filename: "drafts" });
  });

  it("reads an empty path as the root, with the name to be derived", () => {
    expect(placeOf("")).toEqual({ directory: "" });
    expect(placeOf("/")).toEqual({ directory: "" });
  });

  it("takes a name in the root", () => {
    expect(placeOf("decisions.md")).toEqual({
      directory: "",
      filename: "decisions.md",
    });
  });

  it("ignores the empty segments a doubled or leading slash leaves", () => {
    expect(placeOf("//projects//notes//a.md")).toEqual({
      directory: "projects/notes",
      filename: "a.md",
    });
  });
});
