import { describe, expect, it } from "vitest";

import type { JsonObject } from "@notemap/core";

import { capabilitiesFor } from "./capabilities";
import { asItem, conversionOf, CONVERSION } from "./conversion";
import { RenderingFailed } from "./errors";
import { FRONTMATTER } from "./frontmatter";

describe("a body as one item", () => {
  it("puts a one-line body on the item's own line", () => {
    expect(asItem("a thought\n", "task", "")).toBe("- [ ] a thought\n");
    expect(asItem("a thought\n", "list-item", "")).toBe("- a thought\n");
  });

  it("indents the rest beneath it, with no blank line to loosen a list", () => {
    expect(
      asItem("first line\nsecond line\n\nanother paragraph\n", "task", ""),
    ).toBe("- [ ] first line\n  second line\n  another paragraph\n");
  });

  it("says the words rather than the pictures rendered above them", () => {
    expect(
      asItem("![photo.png](photo.png)\n\nlook at this\n", "task", ""),
    ).toBe("- [ ] look at this\n  ![photo.png](photo.png)\n");
  });

  it("says the picture where there are no words at all", () => {
    expect(asItem("![photo.png](photo.png)\n", "task", "")).toBe(
      "- [ ] ![photo.png](photo.png)\n",
    );
  });

  it("flattens a heading to its words", () => {
    expect(asItem("# Buy milk\n\noat, not soy\n", "task", "")).toBe(
      "- [ ] Buy milk\n  oat, not soy\n",
    );
  });

  it("nests a list the body opened with under an item of no words", () => {
    expect(asItem("- one\n- two\n", "list-item", "")).toBe(
      "-\n  - one\n  - two\n",
    );
  });

  it("keeps the blank lines a fenced block holds", () => {
    expect(
      asItem("run this\n\n```sh\necho a\n\necho b\n```\n", "task", ""),
    ).toBe("- [ ] run this\n  ```sh\n  echo a\n\n  echo b\n  ```\n");
  });

  it("puts the hashtags at the end of the item's own line", () => {
    expect(asItem("a thought\n\nmore\n", "task", "#reading #later")).toBe(
      "- [ ] a thought #reading #later\n  more\n",
    );
  });

  it("writes an item with only its hashtags where the body is empty", () => {
    expect(asItem("", "task", "#reading")).toBe("- [ ] #reading\n");
  });

  it("refuses a task with nothing on its own line", () => {
    for (const body of ["", "- one\n- two\n", "```sh\necho a\n```\n"]) {
      expect(() => asItem(body, "task", "")).toThrow(RenderingFailed);
    }
  });

  it("drops a divider, which under the item's words would make them a heading", () => {
    expect(asItem("buy milk\n\n---\n\noat, not soy\n", "task", "")).toBe(
      "- [ ] buy milk\n  oat, not soy\n",
    );
  });

  it("keeps a blank line before a block that would run into the words above it", () => {
    expect(asItem("buy milk\n\n2. oat\n3. soy\n", "task", "")).toBe(
      "- [ ] buy milk\n\n  2. oat\n  3. soy\n",
    );
    expect(asItem("buy milk\n\n    indented code\n", "task", "")).toBe(
      "- [ ] buy milk\n\n      indented code\n",
    );
  });

  it("keeps a blank line before words that would run into a list or a quote", () => {
    expect(asItem("buy\n\n- milk\n\nthen home\n", "task", "")).toBe(
      "- [ ] buy\n  - milk\n\n  then home\n",
    );
    expect(asItem("buy\n\n> milk\n\nthen home\n", "task", "")).toBe(
      "- [ ] buy\n  > milk\n\n  then home\n",
    );
  });
});

describe("which conversion a delivery asked for", () => {
  const args = (held: unknown): JsonObject =>
    ({ [CONVERSION]: held }) as JsonObject;

  it("is block where it asked for none", () => {
    expect(conversionOf({})).toBe("block");
  });

  it("is what it named", () => {
    expect(conversionOf(args("task"))).toBe("task");
    expect(conversionOf(args("list-item"))).toBe("list-item");
  });

  it("fails as a rendering where it named one nobody publishes", () => {
    expect(() => conversionOf(args("haiku"))).toThrow(RenderingFailed);
  });
});

describe("where the argument is offered", () => {
  const declared = capabilitiesFor({ accepts: [], browsable: true });
  const propertiesOf = (name: string) =>
    Object.keys(
      (declared.find((one) => one.name === name)?.argumentsSchema[
        "properties"
      ] ?? {}) as JsonObject,
    );

  it("is on every capability that writes a note, ahead of the frontmatter it gates", () => {
    for (const name of ["create", "append", "create-or-append"]) {
      const properties = propertiesOf(name);
      expect(properties).toContain(CONVERSION);
      expect(properties.indexOf(CONVERSION)).toBeLessThan(
        properties.indexOf(FRONTMATTER),
      );
    }
  });

  it("is not on placing attachments, which writes no note", () => {
    expect(propertiesOf("place-assets")).not.toContain(CONVERSION);
  });
});
