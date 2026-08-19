import type { JsonObject } from "@notemap/core";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { describe, expect, it } from "vitest";

import { createFilesystemDestination } from "./destination";
import { asFilesystemSettings, FILESYSTEM_SETTINGS } from "./settings";
import { delivery, destinationRow, TEXT } from "./testing/fixture";

const schemas = createAjvSchemaValidator();

function issues(settings: JsonObject): readonly string[] {
  return schemas
    .validate(FILESYSTEM_SETTINGS, settings)
    .map((issue) => `${issue.path} ${issue.keyword}`);
}

/**
 * The schema is what core refuses on and what a client builds its form from,
 * so it is checked against the same validator the daemon runs.
 */
describe("the settings a filesystem destination publishes", () => {
  it("accepts a root on its own, and a root with what it takes", () => {
    expect(issues({ root: "~/notes" })).toEqual([]);
    expect(issues({ root: "~/notes", accepts: ["text", "image"] })).toEqual([]);
  });

  it("refuses settings with no root, which is the whole of what it is", () => {
    expect(issues({ accepts: ["text"] })).toEqual(["/root required"]);
    expect(issues({ root: "" })).toEqual(["/root minLength"]);
  });

  it("refuses a key it does not know, rather than ignoring it", () => {
    expect(issues({ root: "~/notes", depth: 2 })).toEqual([
      "/depth additionalProperties",
    ]);
  });

  it("refuses payload types that are not names", () => {
    expect(issues({ root: "~/notes", accepts: "text" })).toEqual([
      "/accepts type",
    ]);
    expect(issues({ root: "~/notes", accepts: [3] })).toEqual([
      "/accepts/0 type",
    ]);
  });
});

/** The schema and the reader have to agree, or a row passes one and fails the other. */
describe("reading settings back off a row", () => {
  it("reads exactly what the schema admits", () => {
    expect(asFilesystemSettings({ root: "~/notes" })).toEqual({
      root: "~/notes",
    });
    expect(
      asFilesystemSettings({ root: "~/notes", accepts: ["text"] }),
    ).toEqual({ root: "~/notes", accepts: ["text"] });
  });

  it("refuses everything the schema refuses", () => {
    expect(asFilesystemSettings({})).toBeUndefined();
    expect(asFilesystemSettings({ root: "" })).toBeUndefined();
    expect(
      asFilesystemSettings({ root: "~/notes", accepts: 3 }),
    ).toBeUndefined();
    expect(
      asFilesystemSettings({ root: "~/notes", accepts: [3] }),
    ).toBeUndefined();
  });
});

describe("a row whose settings the reader cannot make sense of", () => {
  const kind = createFilesystemDestination();
  const broken = { ...destinationRow({ root: "~/notes" }), settings: {} };

  it("cannot say what it can do", async () => {
    await expect(kind.describe(broken)).rejects.toThrow(
      /no readable filesystem settings/,
    );
  });

  /** Retrying cannot change it, so it is rejected rather than reported unreachable. */
  it("refuses a delivery rather than leaving one pending forever", async () => {
    expect(await kind.deliver(broken, delivery())).toEqual({
      kind: "rejected",
      detail: expect.stringContaining("no readable filesystem settings"),
    });
  });
});

describe("what a destination takes when it names nothing", () => {
  it("falls back to what the host said a folder can hold", async () => {
    const kind = createFilesystemDestination({ accepts: [TEXT] });
    const described = await kind.describe(destinationRow({ root: "/tmp" }));

    expect(described.capabilities[0]?.accepts).toEqual([TEXT]);
  });
});
