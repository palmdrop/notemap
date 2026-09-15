import { describe, expect, it } from "vitest";

import { chordFor } from "./bindings";

describe("looking a command's chord up", () => {
  it("answers the default table's own", () => {
    expect(chordFor("discard")).toBe("D");
    expect(chordFor("route")).toBe("mod+enter");
  });

  it("answers nothing for an id the table carries none for", () => {
    expect(chordFor("nothing-binds-to-this")).toBeUndefined();
  });
});
