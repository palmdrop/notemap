import { describe, expect, it } from "vitest";

import type { PoolPorts } from "#types/api/ports";
import type { BlobHash } from "#types/domain/ids";

import { stillHeld, type Landed } from "./output";

const BLOB = "blob:output" as BlobHash;

function ports(...kept: readonly BlobHash[]): PoolPorts {
  return {
    blobs: {
      lastPut: (blob: BlobHash) =>
        Promise.resolve(
          kept.includes(blob) ? "2026-10-09T12:00:00.000Z" : undefined,
        ),
    },
  } as unknown as PoolPorts;
}

const landed: Landed = {
  landing: {
    pointer: "notes/a.md",
    output: {
      content: { blob: BLOB, mediaType: "text/markdown" },
      note: "tags went into the frontmatter",
    },
  },
};

describe("confirming an output under the lock", () => {
  it("keeps the landing whole while its blob is held", async () => {
    expect(await stillHeld(ports(BLOB), landed)).toBe(landed);
  });

  it("keeps the landing and its note, and says the output was lost, when a reclaim took the blob", async () => {
    const kept = await stillHeld(ports(), landed);

    expect(kept?.landing).toEqual({
      pointer: "notes/a.md",
      output: { note: "tags went into the frontmatter" },
    });
    expect(kept?.outputLost).toMatch(/reclaimed/);
  });

  it("asks nothing of a landing that kept no output", async () => {
    const bare: Landed = { landing: { pointer: "notes/a.md" } };

    expect(await stillHeld(ports(), bare)).toBe(bare);
    expect(await stillHeld(ports(), undefined)).toBeUndefined();
  });
});
