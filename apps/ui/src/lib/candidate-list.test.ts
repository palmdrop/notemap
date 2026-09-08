import type { CandidateEntry } from "@notemap/client";
import { describe, expect, it } from "vitest";

import { commonPrefix, completed, narrowed, takenAs } from "./candidate-list";

/** As an are.na channel is answered: read by its title, filed under its slug. */
const channel = (label: string, value: string): CandidateEntry => ({
  label,
  value,
});

const CHANNELS = [
  channel("Reading", "reading"),
  channel("Reading Notes", "reading-notes"),
  channel("Field Recordings", "field-recordings"),
];

describe("what taking an entry leaves in the field", () => {
  it("is the value, which need not be what is read", () => {
    expect(takenAs(channel("Field Recordings", "field-recordings"))).toBe(
      "field-recordings",
    );
  });

  /** Somewhere to look and nothing to hold: its label is all a completion has. */
  it("falls back to the label where there is nothing to take", () => {
    expect(takenAs({ label: "projects", scope: "projects" })).toBe("projects");
  });
});

describe("narrowing a list as it is typed into", () => {
  it("keeps what the title begins with, whatever the case", () => {
    expect(narrowed(CHANNELS, "read").map((each) => each.label)).toEqual([
      "Reading",
      "Reading Notes",
    ]);
  });

  /**
   * The value too, and this is the point: `⇥` resolves a title to a slug, and
   * matching the label alone would empty the list the moment it did.
   */
  it("keeps what the value begins with, so a completed slug still matches", () => {
    expect(narrowed(CHANNELS, "reading-not").map((each) => each.label)).toEqual(
      ["Reading Notes"],
    );
  });

  it("keeps everything where nothing has been typed", () => {
    expect(narrowed(CHANNELS, "")).toHaveLength(3);
  });

  it("is a prefix and not a search", () => {
    expect(narrowed(CHANNELS, "cordings")).toEqual([]);
  });
});

describe("what completing leaves", () => {
  /** The value, so what the field is sent with is what a person sees. */
  it("resolves a title typed to the slug the field holds", () => {
    expect(completed(CHANNELS, "Field")).toBe("field-recordings");
  });

  it("goes as far as several agree, and no further", () => {
    expect(completed(CHANNELS, "readi")).toBe("reading");
  });

  it("does nothing where they agree on no more than was typed", () => {
    expect(completed(CHANNELS, "reading")).toBeUndefined();
  });

  it("does nothing where nothing matches", () => {
    expect(completed(CHANNELS, "zzz")).toBeUndefined();
  });

  it("does nothing where the one match is already written", () => {
    expect(completed(CHANNELS, "field-recordings")).toBeUndefined();
  });

  /**
   * Two titles that share a head whose slugs do not: replacing what was typed
   * with something that does not continue it takes words out of a person's
   * mouth.
   */
  it("leaves a shared head that does not continue what was typed", () => {
    const odd = [channel("Sea Green", "aaa"), channel("Sea Blue", "aab")];

    expect(completed(odd, "Sea")).toBeUndefined();
  });
});

describe("the longest head a set agrees on", () => {
  it("ignores case in the comparison and keeps the first one's spelling", () => {
    expect(commonPrefix(["Reading", "reading-notes"])).toBe("Reading");
  });

  it("is empty where they agree on nothing", () => {
    expect(commonPrefix(["a", "b"])).toBe("");
  });
});
