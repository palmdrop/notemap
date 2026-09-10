import type { CandidateEntry } from "@notemap/client";
import { describe, expect, it } from "vitest";

import {
  commonPrefix,
  completed,
  narrowed,
  readAs,
  resolved,
  takenAs,
} from "./candidate-list";

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

/** Two names for one channel: the slug it is filed under, and the id a retitle leaves alone. */
const PINNED = { label: "Reading", value: "reading", durable: "12345" };

describe("which of an entry's names a surface takes", () => {
  it("takes the lasting one where the decision fires again", () => {
    expect(takenAs(PINNED, "durable")).toBe("12345");
  });

  it("falls back to the value where a thing has one name", () => {
    expect(takenAs(channel("Reading", "reading"), "durable")).toBe("reading");
  });

  it("takes the label where the surface types in names", () => {
    expect(takenAs(PINNED, "label")).toBe("Reading");
  });
});

describe("the name a person reads for what a field holds", () => {
  it("is the label of the entry that value names", () => {
    expect(readAs([PINNED], "12345", "durable")).toBe("Reading");
  });

  /** An answer is one page of what a destination holds; a group channel is not in it. */
  it("is what is there where no entry answers for it", () => {
    expect(readAs([PINNED], "67890", "durable")).toBe("67890");
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

describe("what a typed line means", () => {
  it("resolves a title named exactly to the value it stands for", () => {
    expect(resolved(CHANNELS, "Reading Notes")).toBe("reading-notes");
  });

  it("ignores case and surrounding space", () => {
    expect(resolved(CHANNELS, "  field recordings ")).toBe("field-recordings");
  });

  /**
   * Enough of a title that only one answer still matches, which is what `⇥`
   * takes. Safe here and not on a keystroke: the line is done being typed.
   */
  it("resolves enough of a title that only one still matches", () => {
    expect(resolved(CHANNELS, "Field")).toBe("field-recordings");
    expect(resolved(CHANNELS, "reading-not")).toBe("reading-notes");
  });

  it("leaves a prefix that several still match alone", () => {
    expect(resolved(CHANNELS, "Read")).toBeUndefined();
  });

  it("leaves a value the field already holds alone", () => {
    expect(resolved(CHANNELS, "reading")).toBeUndefined();
  });

  /** One page of an answer, so not being in it is not being wrong. */
  it("leaves anything it does not recognise exactly as written", () => {
    expect(resolved(CHANNELS, "12345")).toBeUndefined();
    expect(resolved(CHANNELS, "a-channel-not-listed")).toBeUndefined();
  });

  it("resolves nothing where two entries share the title", () => {
    const twins = [channel("Notes", "a-notes"), channel("Notes", "b-notes")];

    expect(resolved(twins, "Notes")).toBeUndefined();
  });
});
