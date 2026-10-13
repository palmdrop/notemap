import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { freeAt } from "./free";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-free-"));
  directories.push(directory);
  return directory;
}

describe("how much room is left where a root lives", () => {
  it("answers for a directory that is there", async () => {
    expect(await freeAt(scratch())).toBeGreaterThan(0);
  });

  /** A mirror root is created as writes land in it, so it may not exist yet. */
  it("answers through the nearest existing parent for one that is not", async () => {
    const directory = scratch();

    expect(await freeAt(join(directory, "never", "written", "here"))).toBe(
      await freeAt(directory),
    );
  });
});
