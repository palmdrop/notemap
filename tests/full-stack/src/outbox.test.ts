import { describe, expect, it } from "vitest";

import { daemons, MANUAL, read, until } from "./harness/index.ts";

const daemon = daemons();

type Slice = { values: { id: string }[] };

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
