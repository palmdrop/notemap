import { describe, expect, it } from "vitest";

import { seed } from "@notemap/seed";

import { daemons, MANUAL, read, vaults } from "./harness/index.ts";

const daemon = daemons();

describe("a capture made by the client", () => {
  it("reaches the pool, and comes back on the feed the daemon serves", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "the seam between the client and the daemon",
    });
    await client.drain();

    const served = (await (await fetch(`${running.url}/v1/feed`)).json()) as {
      values: { id: string; payload: { content: { text: string } } }[];
    };

    expect(served.values.map((item) => item.id)).toContain(captured.id);
    expect(served.values[0]?.payload.content.text).toBe(
      "the seam between the client and the daemon",
    );
  });

  it("is what the client's own feed holds once it has read it back", async () => {
    const running = await daemon();
    const client = running.client;

    await client.capture({ channel: MANUAL, text: "read back, not assumed" });
    await client.drain();
    await client.loadFeed();

    const feed = read(client.feed);
    expect(feed.loading).toBe(false);
    expect(feed.items.map((item) => client.says(item))).toEqual([
      "read back, not assumed",
    ]);
  });

  it("shares a pool with everything the seeder put there", async () => {
    const running = await daemon();

    // Destinations are pool state, so the seeder finds none unless a pool was
    // given some: these are what it routes its last two items to.
    const vault = await vaults(running);
    const seeded = await seed(running.url);
    const client = running.client;

    expect(seeded.routed.map((each) => each.destination)).toEqual([
      vault.up,
      vault.down,
    ]);

    await client.loadFeed();
    await client.loadQueue();

    const feed = read(client.feed).items.map((item) => item.id);
    for (const item of [...seeded.queued, ...seeded.processed]) {
      expect(feed).toContain(item);
    }

    // Processed and archived have left the queue; the two never touched have not.
    const queue = read(client.queue).items.map((item) => item.id);
    expect(queue).toEqual(expect.arrayContaining([...seeded.queued]));
    expect(queue).not.toContain(seeded.processed[0]);
    expect(queue).not.toContain(seeded.archived[0]);
  });
});
