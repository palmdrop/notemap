import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { PoolSetting } from "#api/types";
import { createClient } from "../client";
import { Unreachable } from "../errors";
import { read, until } from "#testing/observing";
import { asked as sentTo, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({
    transport,
    store: createMemoryStore(),
  });
  return { client, transport };
}

const UNFURL: PoolSetting = { name: "unfurl", value: true };

describe("reading pool settings", () => {
  it("answers not yet read before the first load", async () => {
    const { client } = clientOver(() => json(200, { values: [UNFURL] }));

    expect(read(client.settings.all)).toBeUndefined();
    expect(await client.settings.load()).toEqual([UNFURL]);
    expect(read(client.settings.all)).toEqual([UNFURL]);
  });

  it("keeps showing what it last saw once the pool goes away", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [UNFURL] }),
    );
    await client.settings.load();

    transport.unreachable(true);
    await expect(client.settings.load()).rejects.toBeInstanceOf(Unreachable);

    expect(read(client.settings.all)).toEqual([UNFURL]);
  });

  it("answers not yet read, never a guessed default, for a cold client", async () => {
    const { client } = clientOver(() => json(200, { values: [UNFURL] }));

    expect(client.settings.held).toBeUndefined();
  });

  it("answers one setting's value, and nothing for one not read", async () => {
    const { client } = clientOver(() =>
      json(200, { values: [{ name: "unfurl", value: false }] }),
    );

    expect(client.settings.value("unfurl")).toBeUndefined();
    await client.settings.load();
    expect(client.settings.value("unfurl")).toBe(false);
    expect(client.settings.value("second")).toBeUndefined();
  });

  it("is dropped when the pool identity changes", async () => {
    const store = createMemoryStore();
    await store.writePoolIdentity("the-pool-that-was");
    await store.writePoolSettings([UNFURL]);

    const transport = mockTransport(() => json(200, { values: [UNFURL] }));
    transport.pool = "the-pool-that-is";
    const client = createClient({ transport, store });

    await until(
      async () => (await store.readPoolIdentity()) === "the-pool-that-is",
    );

    expect(read(client.settings.all)).toBeUndefined();
    expect(await store.readPoolSettings()).toBeUndefined();
  });
});

describe("changing a pool setting", () => {
  it("sends only the named setting, and caches what the pool answered", async () => {
    const { client, transport } = clientOver((request) =>
      request.method === "PATCH"
        ? json(200, { values: [{ name: "unfurl", value: false }] })
        : json(200, { values: [UNFURL] }),
    );
    await client.settings.load();

    const answer = await client.settings.change("unfurl", false);
    expect(answer).toEqual([{ name: "unfurl", value: false }]);
    expect(read(client.settings.all)).toEqual([
      { name: "unfurl", value: false },
    ]);

    const request = sentTo(transport).at(-1);
    expect(request === undefined ? undefined : routeOf(request)).toBe(
      "PATCH /v1/settings",
    );
    expect(
      request === undefined
        ? undefined
        : ((await request.clone().json()) as unknown),
    ).toEqual({ unfurl: false });
  });

  it("is refused rather than queued while the pool is unreachable", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [UNFURL] }),
    );
    transport.unreachable(true);

    await expect(
      client.settings.change("unfurl", false),
    ).rejects.toBeInstanceOf(Unreachable);

    expect(read(client.outbox)).toEqual([]);
  });
});
