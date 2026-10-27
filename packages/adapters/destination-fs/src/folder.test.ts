import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemDestination } from "./destination";
import { delivery, destinationRow, root, TEXT } from "./testing/fixture";

const PATHS = { home: "/home/someone", relativeTo: "/srv/notemap" };

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A vault holding a folder named exactly where a note is about to go. */
async function vault() {
  const made = root();
  cleanups.push(made.cleanup);
  await mkdir(join(made.path, "ideas"), { recursive: true });
  const kind = createFilesystemDestination({ accepts: [TEXT], paths: PATHS });

  return (capability: string, args: Record<string, string>) =>
    kind.deliver(
      destinationRow({ root: made.path }),
      delivery({ capability, arguments: args }),
    );
}

describe("routing onto a path that is a folder", () => {
  it("refuses an append, saying it is a folder", async () => {
    const deliver = await vault();

    expect(await deliver("append", { path: "ideas" })).toEqual({
      kind: "rejected",
      detail: "ideas is a folder, not a note",
    });
  });

  it("refuses create-or-append, saying it is a folder", async () => {
    const deliver = await vault();

    expect(await deliver("create-or-append", { path: "ideas" })).toEqual({
      kind: "rejected",
      detail: "ideas is a folder, not a note",
    });
  });

  it("refuses a create, saying it is a folder", async () => {
    const deliver = await vault();

    expect(
      await deliver("create", { directory: "", filename: "ideas" }),
    ).toEqual({
      kind: "rejected",
      detail: "ideas is a folder, not a note",
    });
  });
});
