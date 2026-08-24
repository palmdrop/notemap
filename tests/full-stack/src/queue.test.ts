import { describe, expect, it } from "vitest";

import { daemons, MANUAL, read } from "./harness/index.ts";

const daemon = daemons();

type Slice = { values: { id: string }[] };

const queueOf = async (url: string): Promise<string[]> =>
  ((await (await fetch(`${url}/v1/queue`)).json()) as Slice).values.map(
    (item) => item.id,
  );

describe("archiving", () => {
  it("takes the item out of the queue, on both sides of the wire", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "read it, kept nothing",
    });
    await client.drain();
    await client.loadQueue();

    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      captured.id,
    ]);
    expect(await queueOf(running.url)).toEqual([captured.id]);

    await client.archive(captured.id, "read it, kept nothing");
    await client.drain();

    expect(read(client.queue).items).toEqual([]);
    expect(await queueOf(running.url)).toEqual([]);
  });
});

describe("editing", () => {
  it("amends an unprocessed capture in place, on both sides of the wire", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "a first thought",
    });
    await client.drain();
    await client.loadQueue();

    await client.edit(captured.id, client.saying(captured, "a better thought"));
    await client.drain();

    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      captured.id,
    ]);
    const held = await client.item(captured.id);
    expect(held?.payload.content["text"]).toBe("a better thought");
    expect(held?.revisedInto).toEqual([]);
    expect(await queueOf(running.url)).toEqual([captured.id]);
  });

  it("revises a processed one, and the feed carries it at its own time", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "a first thought",
    });
    await client.drain();
    await client.loadQueue();
    await client.routing.markProcessed(captured.id, "pasted it");

    await client.edit(captured.id, client.saying(captured, "said again"));
    await client.drain();

    const from = await client.item(captured.id);
    const revision = from?.revisedInto[0];
    if (revision === undefined) throw new Error("expected a revision");

    // The revision is work of its own; the item it came from is not.
    expect(await queueOf(running.url)).toEqual([revision]);
    expect(read(client.queue).items.map((item) => item.id)).toEqual([revision]);

    // And it is a capture in the feed, after the one it was made from.
    const feed = (await (
      await fetch(`${running.url}/v1/feed?order=oldest-first`)
    ).json()) as { values: { id: string; createdAt: string }[] };
    const [older, newer] = feed.values;
    expect([older?.id, newer?.id]).toEqual([captured.id, revision]);
    // Its own capture time, so it sits at the newest end rather than beside it.
    expect(newer?.createdAt).not.toBe(older?.createdAt);
  });
});
