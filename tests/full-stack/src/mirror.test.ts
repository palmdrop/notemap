import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { daemons, MANUAL, until } from "./harness/index.ts";

const daemon = daemons();

async function recordFor(
  root: string,
  item: string,
): Promise<string | undefined> {
  const entries = await readdir(root, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    const record = await readFile(join(entry.parentPath, entry.name), "utf8");
    if (record.includes(item)) return record;
  }
  return undefined;
}

describe("the mirror, on the daemon's own timer", () => {
  it("writes a capture to disk with nobody draining it", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "the mirror is the backup, the database is the index",
    });
    await client.drain();

    const record = await until(`a mirror record for ${captured.id}`, () =>
      recordFor(running.world.mirror, captured.id),
    );

    expect(JSON.parse(record)).toMatchObject({
      item: {
        id: captured.id,
        payload: {
          content: {
            text: "the mirror is the backup, the database is the index",
          },
        },
      },
    });
  });
});
