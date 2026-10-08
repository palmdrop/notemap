import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PLACE_ASSETS } from "@notemap/output-markdown";

import { Contended } from "./errors";
import { carryOutPlacing, composePlacing } from "./placing";
import { bytes, deliveredAsset, delivery, root } from "./testing/fixture";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function vault(): Promise<string> {
  const made = root();
  cleanups.push(made.cleanup);
  await mkdir(made.path, { recursive: true });
  return made.path;
}

function paper(content: string) {
  const held = bytes(content);
  return deliveredAsset(
    "000",
    "paper.pdf",
    held,
    createHash("sha256").update(held).digest("hex"),
  );
}

const placing = (content: string) =>
  delivery({
    capability: PLACE_ASSETS,
    arguments: { directory: "" },
    attached: [paper(content)],
  });

describe("a name taken between the walk and the write", () => {
  /** A retry walks past it, so it is never a refusal. */
  it("is contended rather than refused", async () => {
    const path = await vault();
    const composed = await composePlacing(path, placing("ours"), {
      exact: true,
    });
    await writeFile(join(path, "paper.pdf"), "theirs");

    await expect(carryOutPlacing(composed)).rejects.toBeInstanceOf(Contended);
  });
});

describe("a walk for a preview", () => {
  it("takes a file of the same size for these bytes, without reading it", async () => {
    const path = await vault();
    await writeFile(join(path, "paper.pdf"), "xxxx");

    const composed = await composePlacing(path, placing("ours"), {
      exact: false,
    });

    expect(composed.placed.map((each) => [each.name, each.there])).toEqual([
      ["paper.pdf", true],
    ]);
  });
});
