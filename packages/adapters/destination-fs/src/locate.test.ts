import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CapabilityName, LocateRequest } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemDestination } from "./destination";
import { delivery, destinationRow, root, TEXT } from "./testing/fixture";

const PATHS = { home: "/home/someone", relativeTo: "/srv/notemap" };

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function vault() {
  const made = root();
  cleanups.push(made.cleanup);
  await mkdir(made.path, { recursive: true });
  const kind = createFilesystemDestination({ accepts: [TEXT], paths: PATHS });
  const row = destinationRow({ root: made.path });

  return {
    path: made.path,
    deliver: (...args: Parameters<typeof delivery>) =>
      kind.deliver(row, delivery(...args)),
    locate: (request: Partial<LocateRequest>) => {
      if (kind.locate === undefined)
        throw new Error("the kind looks for nothing");
      return kind.locate(row, {
        capability: "create" as CapabilityName,
        arguments: {},
        ...request,
      });
    },
  };
}

describe("looking for what a record points at", () => {
  it("finds the note a delivery made", async () => {
    const { deliver, locate } = await vault();
    const outcome = await deliver({
      arguments: { directory: "inbox", filename: "a-thought.md" },
    });
    if (outcome.kind !== "delivered" || outcome.pointer === undefined) {
      throw new Error("expected a delivery naming its note");
    }

    expect(await locate({ pointer: outcome.pointer })).toEqual({
      kind: "present",
      found: 1,
      of: 1,
    });
  });

  it("answers absent once the note is gone", async () => {
    const { path, locate } = await vault();
    await mkdir(join(path, "inbox"));
    await writeFile(join(path, "inbox", "a-thought.md"), "a thought\n");
    await rm(join(path, "inbox", "a-thought.md"));

    expect(await locate({ pointer: "inbox/a-thought.md" })).toEqual({
      kind: "absent",
    });
  });

  it("answers absent where the folder it was in is gone too", async () => {
    const { locate } = await vault();

    expect(await locate({ pointer: "gone/a-thought.md" })).toEqual({
      kind: "absent",
    });
  });

  /** Placing assets points at the folder, which says nothing about what was placed. */
  it("cannot tell for a folder", async () => {
    const { path, locate } = await vault();
    await mkdir(join(path, "pictures"));

    expect(await locate({ pointer: "pictures" })).toMatchObject({
      kind: "unknown",
    });
  });

  it("cannot tell for a record with no pointer", async () => {
    const { locate } = await vault();

    expect(await locate({})).toEqual({ kind: "unknown" });
  });

  it("never looks outside the root", async () => {
    const { locate } = await vault();

    expect(await locate({ pointer: "../../etc/passwd" })).toMatchObject({
      kind: "unknown",
      detail: expect.stringMatching(/outside the destination/),
    });
  });
});
