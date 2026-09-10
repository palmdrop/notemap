import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

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
      capability: "create",
      arguments: args,
    });
    const owed = await client.routing.route(stranded.id, {
      destination: vault.down,
      capability: "create",
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

  /**
   * The words go over the real transport, through the real body schema, and
   * come out of a real markdown renderer. Nothing below this layer can say
   * whether `content` survived every one of them.
   */
  it("writes the words the decision carried, and leaves the capture alone", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    const captured = await client.capture({
      channel: MANUAL,
      text: "a thought",
    });
    await client.drain();

    const record = await client.routing.route(captured.id, {
      destination: vault.up,
      capability: "create",
      arguments: { directory: "inbox", filename: "a-thought.md" },
      content: { text: "a thought, tidied" },
    });

    const landed = await until("the vault to hold the delivery", () =>
      delivered(running.world.up),
    );

    expect(await readFile(join(running.world.up, landed), "utf8")).toContain(
      "a thought, tidied",
    );
    expect(record.target).toMatchObject({
      content: { text: "a thought, tidied" },
    });
    expect((await client.item(captured.id)).item?.payload.content).toEqual({
      text: "a thought",
    });
  });

  /**
   * Retiring carries no body, which is the one shape `openapi-fetch` sends
   * without a media type and the daemon now refuses. Only the real transport
   * against the real surface can say whether the header made the trip.
   */
  it("retires a destination over a request that carries nothing", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    expect((await client.destinations.retire(vault.down)).retired).toBe(true);
    expect((await client.destinations.unretire(vault.down)).retired).toBe(
      false,
    );
  });
});
