import { readdir } from "node:fs/promises";

import { describe, it } from "vitest";

import { daemons, MANUAL, until, vaults } from "./harness/index.ts";

const daemon = daemons();

describe("a trigger tag's delivery", () => {
  /** No poll falls inside the window, so only being told of the firing gets there in time. */
  it("lands as its window closes, however long the runner's poll", async () => {
    const running = await daemon({ deliveryPoll: 60_000, triggerWindow: 300 });
    const client = running.client;
    const vault = await vaults(running);

    await client.templates.create({
      name: "Inbox",
      destination: vault.up,
      capability: "create",
      arguments: { directory: "inbox", filename: "a-thought.md" },
      triggerTag: "route/inbox",
    });
    const captured = await client.capture({
      channel: MANUAL,
      text: "a thought",
    });
    await client.drain();

    await client.tag(captured.id, "route/inbox");
    await client.drain();

    await until(
      "the vault to hold the delivery",
      async () => {
        const entries = await readdir(running.world.up, { recursive: true });
        return entries.find((name) => name.endsWith(".md"));
      },
      5_000,
    );
  });
});
