import { describe, expect, it } from "vitest";

import { collectionOf, collectionsUnder, contain } from "./paths";

function contained(root: string, target: string) {
  const result = contain(root, target);
  if (result.kind !== "contained") {
    throw new Error(`${target} was refused: ${result.detail}`);
  }
  return result.path;
}

describe("containment", () => {
  it("resolves a target against the root and states it relative to it", () => {
    const path = contained("Notes/Vault", "inbox/a thought.md");

    expect(path.relative).toBe("inbox/a thought.md");
    expect(path.encoded).toBe("Notes/Vault/inbox/a%20thought.md");
  });

  it("percent-encodes each segment, because vault folders have spaces in them", () => {
    const path = contained("Min katalog", "Höst & vår/en anteckning.md");

    expect(path.encoded).toBe(
      "Min%20katalog/H%C3%B6st%20%26%20v%C3%A5r/en%20anteckning.md",
    );
    expect(path.relative).toBe("Höst & vår/en anteckning.md");
  });

  /**
   * The whole of the second guarantee: a separator inside a segment is encoded
   * rather than obeyed, so no name can address anything the base URL does not
   * contain even where the arithmetic below were wrong.
   */
  it("encodes what would otherwise leave the path", () => {
    const path = contained("vault", "a?b#c.md");

    expect(path.encoded).toBe("vault/a%3Fb%23c.md");
  });

  it("takes a target that climbs and comes back", () => {
    expect(contained("vault", "inbox/../notes/a.md").relative).toBe(
      "notes/a.md",
    );
  });

  it("refuses a target that leaves the destination", () => {
    for (const target of [
      "../elsewhere.md",
      "inbox/../../elsewhere.md",
      "/etc/passwd",
      "../../../../../../root/.ssh/authorized_keys",
    ]) {
      expect(contain("Notes/Vault", target)).toMatchObject({
        kind: "refused",
      });
    }
  });

  /** Sibling-of-the-root is the case a depth count alone gets wrong. */
  it("refuses a target that leaves sideways without getting shorter", () => {
    expect(contain("a/b", "../c/note.md")).toMatchObject({ kind: "refused" });
  });

  it("takes an empty root, which names the account's own collection", () => {
    expect(contained("", "a.md").encoded).toBe("a.md");
    expect(contain("", "../a.md")).toMatchObject({ kind: "refused" });
  });

  it("treats a repeated or trailing separator as one path", () => {
    expect(contained("vault/", "inbox//a.md").relative).toBe("inbox/a.md");
  });
});

describe("what has to exist first", () => {
  it("names every collection between the root and the note, outermost first", () => {
    const path = contained("Vault", "a/b/c/note.md");

    expect(collectionsUnder(path)).toEqual([
      "Vault/a",
      "Vault/a/b",
      "Vault/a/b/c",
    ]);
  });

  /** The root is not among them: one that is not there is reported, never conjured. */
  it("leaves the root out, and asks for nothing where the note sits in it", () => {
    expect(collectionsUnder(contained("Vault", "note.md"))).toEqual([]);
    expect(collectionsUnder(contained("", "note.md"))).toEqual([]);
  });

  it("says which collection a note sits in, which is where its assets go", () => {
    expect(collectionOf(contained("Vault", "a/note.md"))).toBe("Vault/a");
    expect(collectionOf(contained("Vault", "note.md"))).toBe("Vault");
  });
});
