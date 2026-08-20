import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Destination } from "@notemap/core";

import {
  captureMany,
  createVault,
  daemon,
  ids,
  send,
  slice,
  type Daemon,
} from "../testing/fixture";

const open: Daemon[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function serving(): Daemon {
  const host = daemon();
  open.push(host);
  return host;
}

type Vaulted = Daemon & { readonly vault: Destination };

/**
 * A pool holding one filesystem destination over the daemon's own folder.
 * **`missing`** points it at one that is not there, which is what an unmounted
 * drive looks like.
 */
async function vaulted(where: "ready" | "missing"): Promise<Vaulted> {
  const host = daemon(undefined, { vault: where });
  open.push(host);
  return { ...host, vault: await createVault(host) };
}

type Record_ = {
  id: string;
  item: string;
  state: string;
  pointer?: string;
  target: { kind: string; destination?: string; target?: unknown };
};

async function route(
  host: Vaulted,
  item: string,
  target: unknown = { directory: "inbox", filename: "a-thought.md" },
): Promise<Response> {
  return send(host.app, `/v1/items/${item}/route`, {
    destination: host.vault.id,
    capability: "create-file",
    target,
  });
}

async function only(host: Pick<Daemon, "app">): Promise<string> {
  const [item] = await captureMany(host.app, 1);
  if (item === undefined) throw new Error("expected a capture");
  return item;
}

const body = (response: Response) => response.json() as Promise<never>;

const queued = async (host: Pick<Daemon, "app">): Promise<string[]> =>
  ids(await slice(host.app, "/v1/queue"));

describe("marking an item processed over the wire", () => {
  it("answers the routing record it appended", async () => {
    const { app } = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/mark-processed`, {
      note: "into the vault",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(await body(response)).toMatchObject({
      item: first,
      target: { kind: "user", note: "into the vault" },
    });
  });

  it("leaves the item in the feed, unarchived", async () => {
    const { app } = serving();
    const [first] = await captureMany(app, 1);

    await send(app, `/v1/items/${first}/mark-processed`);

    expect(ids(await slice(app, "/v1/feed"))).toEqual([first]);
    expect(await slice(app, "/v1/archived")).toEqual({ values: [] });
  });

  it("answers 404 for an id no item has", async () => {
    const { app } = serving();

    const response = await send(app, "/v1/items/nobody/mark-processed");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });
});

describe("GET /v1/items/:id/routing", () => {
  it("answers every record, oldest first", async () => {
    const { app } = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/mark-processed`, { note: "one" });

    const response = await app.request(`/v1/items/${first}/routing`);

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      values: [{ item: first, target: { kind: "user", note: "one" } }],
    });
  });

  it("answers an empty list for an item that has been nowhere", async () => {
    const { app } = serving();
    const [first] = await captureMany(app, 1);

    expect(await body(await app.request(`/v1/items/${first}/routing`))).toEqual(
      { values: [] },
    );
  });

  it("answers 404 for an id no item has, unlike the action log", async () => {
    const { app } = serving();

    const response = await app.request("/v1/items/nobody/routing");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });
});

describe("an item's routing summary, on every row it appears in", () => {
  type Summary = {
    records: number;
    pending: number;
    to: { kind: string; destination?: string }[];
  };
  type Row = { id: string; routing?: Summary };

  async function feedRows(host: Pick<Daemon, "app">): Promise<Row[]> {
    return (
      (await body(await host.app.request("/v1/feed"))) as { values: Row[] }
    ).values;
  }

  it("is absent on an item that has been nowhere", async () => {
    const host = serving();
    await captureMany(host.app, 1);

    expect((await feedRows(host))[0]?.routing).toBeUndefined();
  });

  it("says how many records there are, how many are pending, and where they went", async () => {
    const host = await vaulted("missing");
    const item = await only(host);
    await route(host, item);
    await send(host.app, `/v1/items/${item}/mark-processed`, {});

    expect((await feedRows(host))[0]?.routing).toEqual({
      records: 2,
      pending: 1,
      to: [
        { kind: "destination", destination: host.vault.id },
        { kind: "user" },
      ],
    });
  });

  /** The queue excludes a routed item, so the surface that shows one is the feed's. */
  it("is on the item route and the archive as well as the feed", async () => {
    const host = serving();
    const item = await only(host);
    await send(host.app, `/v1/items/${item}/mark-processed`, {});
    await send(host.app, `/v1/items/${item}/archive`, {});

    const one = (await body(
      await host.app.request(`/v1/items/${item}`),
    )) as Row;
    const archived = (await body(await host.app.request("/v1/archived"))) as {
      values: Row[];
    };

    expect(one.routing).toEqual({
      records: 1,
      pending: 0,
      to: [{ kind: "user" }],
    });
    expect(archived.values[0]?.routing?.records).toBe(1);
  });

  it("goes again when the one reservation is cancelled", async () => {
    const host = await vaulted("missing");
    const item = await only(host);
    const record = (await body(await route(host, item))) as Record_;

    await send(host.app, `/v1/routing/${record.id}/cancel`);

    expect((await feedRows(host))[0]?.routing).toBeUndefined();
  });
});

describe("POST /v1/items/{id}/route", () => {
  it("delivers to a folder that is there, and names the file it landed at", async () => {
    const host = await vaulted("ready");
    const item = await only(host);

    const response = await route(host, item);
    expect(response.status).toBe(200);

    const record = (await body(response)) as Record_;
    expect(record).toMatchObject({
      item,
      state: "delivered",
      pointer: "inbox/a-thought.md",
      target: { kind: "destination", destination: host.vault.id },
    });

    const written = await readFile(
      join(host.vaultRoot, record.pointer ?? ""),
      "utf8",
    );
    expect(written).toContain("a thought");
    expect(await queued(host)).toEqual([]);
  });

  it("answers a pending record for a folder that is not there, and keeps the decision", async () => {
    const host = await vaulted("missing");
    const item = await only(host);

    const record = (await body(await route(host, item))) as Record_;

    expect(record.state).toBe("pending");
    expect(record.pointer).toBeUndefined();
    // The decision took the item out of the queue although nothing arrived.
    expect(await queued(host)).toEqual([]);
  });

  it("refuses a traversal with the destination's own detail, and writes nothing", async () => {
    const host = await vaulted("ready");
    const item = await only(host);

    const response = await route(host, item, {
      directory: "../..",
      filename: "escaped.md",
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "rejected-by-destination" },
    });
    // Refused means abandoned at once, so the item is still to be decided.
    expect(await queued(host)).toEqual([item]);
  });

  it("refuses a capability the destination never declared, without touching the disk", async () => {
    const host = await vaulted("ready");
    const item = await only(host);

    const response = await send(host.app, `/v1/items/${item}/route`, {
      destination: host.vault.id,
      capability: "post-to-board",
      target: {},
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "capability-undeclared", capability: "post-to-board" },
    });
    expect(await queued(host)).toEqual([item]);
  });

  it("refuses an id no destination has", async () => {
    const host = await vaulted("ready");
    const item = await only(host);

    const response = await send(host.app, `/v1/items/${item}/route`, {
      destination: "elsewhere",
      capability: "create-file",
      target: { directory: "" },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-destination", destination: "elsewhere" },
    });
  });

  it("refuses a target the capability's schema does not accept", async () => {
    const host = await vaulted("ready");
    const item = await only(host);

    const response = await route(host, item, { folder: "inbox" });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "target-invalid" },
    });
  });

  it("is 404 for an id no item has", async () => {
    const host = await vaulted("ready");

    const response = await route(host, "nobody");
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "no-such-item" },
    });
  });

  it("refuses a body with a key it does not know", async () => {
    const host = await vaulted("ready");
    const item = await only(host);

    const response = await send(host.app, `/v1/items/${item}/route`, {
      destination: host.vault.id,
      capability: "create-file",
      target: {},
      when: "now",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /v1/routing/{record}/cancel", () => {
  async function pending(): Promise<{
    host: Vaulted;
    item: string;
    record: string;
  }> {
    const host = await vaulted("missing");
    const item = await only(host);
    const record = (await body(await route(host, item))) as Record_;
    if (record.state !== "pending") throw new Error("expected a reservation");
    return { host, item, record: record.id };
  }

  it("removes the reservation and returns the item to the queue", async () => {
    const { host, item, record } = await pending();

    const response = await send(host.app, `/v1/routing/${record}/cancel`);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    expect(await queued(host)).toEqual([item]);
    const left = (await body(
      await host.app.request(`/v1/items/${item}/routing`),
    )) as { values: unknown[] };
    expect(left.values).toEqual([]);
  });

  it("refuses a record that has already delivered", async () => {
    const host = await vaulted("ready");
    const item = await only(host);
    const record = (await body(await route(host, item))) as Record_;

    const response = await send(host.app, `/v1/routing/${record.id}/cancel`);
    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      error: { code: "not-pending" },
    });
  });

  it("is 404 for an id no record has", async () => {
    const host = await vaulted("ready");

    const response = await send(host.app, "/v1/routing/nobody/cancel");
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "no-such-record" },
    });
  });
});

describe("a delivery the runner picks up", () => {
  it("lands once the folder appears, and fills the pointer in", async () => {
    const host = await vaulted("missing");
    const item = await only(host);
    const record = (await body(await route(host, item))) as Record_;
    expect(record.state).toBe("pending");

    // The drive is plugged back in.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(host.vaultRoot, { recursive: true });

    expect(await host.deliver()).toBe(1);

    const after = (await body(
      await host.app.request(`/v1/items/${item}/routing`),
    )) as { values: Record_[] };
    expect(after.values[0]).toMatchObject({
      id: record.id,
      state: "delivered",
      pointer: "inbox/a-thought.md",
    });
    expect(
      await readFile(join(host.vaultRoot, "inbox", "a-thought.md"), "utf8"),
    ).toContain("a thought");
  });
});
