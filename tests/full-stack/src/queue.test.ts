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
