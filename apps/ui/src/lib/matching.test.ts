import { describe, expect, it } from "vitest";

import { match, search } from "./matching";

describe("how a name answers what is typed", () => {
  it("is at the head where the name begins with it, whatever the case", () => {
    expect(match("Reading", "read")).toBe("prefix");
  });

  it("is within where it falls anywhere else in the name", () => {
    expect(match("Field recordings", "cord")).toBe("within");
  });

  it("is not where the name holds none of it", () => {
    expect(match("Reading", "xyz")).toBeUndefined();
  });
});

describe("searching a list", () => {
  const names = ["Reading", "Field recordings", "Read later", "Proofreading"];
  const each = (name: string) => [name];

  it("keeps everything where nothing has been typed", () => {
    expect(search(names, "", each)).toEqual(names);
  });

  it("puts head matches ahead of the rest, each in the order given", () => {
    expect(search(names, "read", each)).toEqual([
      "Reading",
      "Read later",
      "Proofreading",
    ]);
  });

  it("matches under any of an item's names", () => {
    const channels = [
      { label: "Reading", value: "reading-4" },
      { label: "Notes", value: "notes-2" },
    ];
    expect(
      search(channels, "ing-4", (one) => [one.label, one.value]).map(
        (one) => one.label,
      ),
    ).toEqual(["Reading"]);
  });

  it("drops what matches under no name", () => {
    expect(search(names, "zzz", each)).toEqual([]);
  });
});
