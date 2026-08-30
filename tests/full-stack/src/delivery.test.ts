import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { daemons, MANUAL, until, vaults } from "./harness/index.ts";

const daemon = daemons();

async function delivered(root: string): Promise<string | undefined> {
  const entries = await readdir(root, { recursive: true }).catch(() => []);
  return entries.find((name) => name.endsWith(".md"));
}

describe("a delivery, on the daemon's own timer", () => {
  it("lands in the folder that is there, and stays owed to the one that is not", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    const carried = await client.capture({
      channel: MANUAL,
      text: "one for the vault",
    });
    const stranded = await client.capture({
      channel: MANUAL,
      text: "one for the drive nobody mounted",
    });
    await client.drain();

    const args = { directory: "inbox", filename: "a-thought.md" };
    await client.routing.route(carried.id, {
      destination: vault.up,
      capability: "create-file",
      arguments: args,
    });
    const owed = await client.routing.route(stranded.id, {
      destination: vault.down,
      capability: "create-file",
      arguments: args,
    });

    await until("the vault to hold the delivery", () =>
      delivered(running.world.up),
    );

    // The runner has demonstrably passed, so the record still pending is the
    // destination being unreachable rather than the daemon not having got to it.
    const records = await client.routing.recordsFor(stranded.id);
    expect(records.map((record) => record.id)).toEqual([owed.id]);
    expect(records[0]?.state).toBe("pending");
    expect(await delivered(running.world.down)).toBeUndefined();
  });
});
