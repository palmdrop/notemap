import {
  createClient,
  createFetchTransport,
  createMemoryStore,
} from "@notemap/client";
import { describe, expect, it } from "vitest";

import { daemons, IMAGE_SOURCE, MANUAL, read, until } from "./harness/index.ts";

const daemon = daemons();

type Slice = { values: { id: string; tags: { name: string }[] }[] };

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("an outbox that filled up while the daemon was gone", () => {
  it("replays what it holds, once, when the daemon comes back", async () => {
    const running = await daemon();
    const client = running.client;
    await running.stop();

    const captured = await client.capture({
      channel: MANUAL,
      text: "written to nobody",
    });
    await client.drain();

    // The operation is the client's until a daemon takes it: an unreachable
    // pool is not a refusal, and nothing is dropped for it.
    expect(read(client.outbox)).toHaveLength(1);

    const again = await daemon(running.world);
    await until("the outbox to empty", async () => {
      await client.drain();
      return read(client.outbox).length === 0 ? true : undefined;
    });

    const feed = (await (await fetch(`${again.url}/v1/feed`)).json()) as Slice;
    expect(feed.values.map((item) => item.id)).toEqual([captured.id]);
  });
});

describe("an outbox the tab was closed on", () => {
  it("lands everything once when the client is built again, bytes included", async () => {
    const running = await daemon();
    const { url, world } = running;
    // The store outlives the client over it, which is what a reload is.
    const store = createMemoryStore();

    const before = createClient({
      transport: createFetchTransport(url),
      store,
    });
    await running.stop();

    const asset = await before.attach(
      new File([BYTES], "whiteboard.png", { type: "image/png" }),
    );
    const captured = await before.capture({
      channel: IMAGE_SOURCE,
      text: "before anyone rubbed it out",
      asset,
    });
    await before.tag(captured.id, "meeting");
    await before.drain();

    expect(read(before.outbox)).toHaveLength(2);
    before.close();

    const again = await daemon(world);
    const after = createClient({
      transport: createFetchTransport(again.url),
      store,
    });

    await until("the outbox to empty", async () => {
      await after.drain();
      return read(after.outbox).length === 0 ? true : undefined;
    });

    const feed = (await (await fetch(`${again.url}/v1/feed`)).json()) as Slice;
    expect(feed.values.map((item) => item.id)).toEqual([captured.id]);
    expect(feed.values[0]?.tags.map((tag) => tag.name)).toEqual(["meeting"]);

    // The bytes went up with the capture, and are the pool's to serve now.
    const served = await fetch(after.assetContent(asset));
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(BYTES);

    after.close();
  });
});
