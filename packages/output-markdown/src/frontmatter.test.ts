import { describe, expect, it } from "vitest";

import type { FrontmatterValue } from "./frontmatter";
import { readFrontmatter, toYaml } from "./frontmatter";

describe("readFrontmatter", () => {
  it("reads back exactly what toYaml wrote, and the body after it", () => {
    const written = new Map<string, FrontmatterValue>([
      ["id", "item-1"],
      ["captured_at", "2026-09-10T09:00:00.000Z"],
      ["tags", ["design", "research"]],
      ["count", 3],
      ["draft", true],
      ["title", "a thought: with punctuation, and 'quotes'"],
    ]);

    const read = readFrontmatter(`${toYaml(written)}a thought\n\nand more\n`);

    expect(read?.entries).toEqual(written);
    expect(read?.body).toBe("a thought\n\nand more\n");
  });

  it("answers nothing for text with no block", () => {
    expect(readFrontmatter("a thought\n")).toBeUndefined();
    expect(readFrontmatter("--- not a block\n")).toBeUndefined();
    expect(readFrontmatter("")).toBeUndefined();
  });

  it("answers nothing for a block that is not YAML", () => {
    expect(readFrontmatter("---\n: [\n---\nbody\n")).toBeUndefined();
    expect(readFrontmatter("---\n- a list\n---\nbody\n")).toBeUndefined();
  });

  it("keeps only what the writer could have written", () => {
    const read = readFrontmatter(
      "---\nname: 'plain'\nnested:\n  deep: true\nmixed:\n  - 'one'\n  - 2\nempty: null\n---\n",
    );

    expect([...(read?.entries.keys() ?? [])]).toEqual(["name"]);
    expect(read?.body).toBe("");
  });

  it("reads a block that ends the text", () => {
    const read = readFrontmatter("---\nid: 'x'\n---");
    expect(read?.entries.get("id")).toBe("x");
    expect(read?.body).toBe("");
  });
});
