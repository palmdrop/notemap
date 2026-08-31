import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { captureMany, daemon, send, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function serving(vault?: "ready"): Daemon {
  const host = daemon(undefined, vault === undefined ? {} : { vault });
  open.push(host);
  return host;
}

const body = (response: Response) => response.json() as Promise<never>;

type Declared = {
  id: string;
  name: string;
  kind: string;
  settings: Record<string, unknown>;
  retired: boolean;
};

async function create(
  host: Daemon,
  overrides: {
    name?: string;
    kind?: string;
    settings?: Record<string, unknown>;
  } = {},
): Promise<Response> {
  return send(host.app, "/v1/destinations", {
    name: overrides.name ?? "Vault",
    kind: overrides.kind ?? "filesystem",
    settings: overrides.settings ?? { root: host.vaultRoot },
  });
}

async function created(
  host: Daemon,
  overrides: Parameters<typeof create>[1] = {},
): Promise<Declared> {
  const response = await create(host, overrides);
  if (response.status !== 201) {
    throw new Error(`refused: ${await response.text()}`);
  }
  return (await body(response)) as Declared;
}

async function list(host: Daemon): Promise<Declared[]> {
  const answered = (await body(await host.app.request("/v1/destinations"))) as {
    values: Declared[];
  };
  return answered.values;
}

describe("GET /v1/destination-kinds", () => {
  it("publishes the schema a client builds its settings form from", async () => {
    const host = serving();

    const response = await host.app.request("/v1/destination-kinds");
    expect(response.status).toBe(200);

    const answered = (await body(response)) as {
      values: { name: string; settingsSchema: Record<string, unknown> }[];
    };
    expect(answered.values.map((each) => each.name)).toEqual(["filesystem"]);
    expect(answered.values[0]?.settingsSchema).toMatchObject({
      required: ["root"],
    });
  });
});

describe("GET /v1/destinations", () => {
  it("answers an empty list where none exists, rather than refusing", async () => {
    const host = serving();

    const response = await host.app.request("/v1/destinations");
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ values: [] });
  });

  /**
   * The split exists so nothing pays for reachability it did not ask for: a
   * settings screen or a routing picker must not stall on an unmounted drive.
   */
  it("makes no adapter call, so an unreachable destination costs it nothing", async () => {
    const host = serving();
    await created(host);

    // The vault folder was never made, so describing it would go to the disk.
    expect(await list(host)).toEqual([
      {
        id: expect.any(String),
        name: "Vault",
        kind: "filesystem",
        settings: { root: host.vaultRoot },
        retired: false,
      },
    ]);
  });

  it("lists a retired destination rather than hiding it", async () => {
    const host = serving();
    const vault = await created(host);

    await send(host.app, `/v1/destinations/${vault.id}/retire`);

    expect((await list(host)).map((each) => each.retired)).toEqual([true]);
  });
});

describe("POST /v1/destinations", () => {
  it("mints an id, answers 201 and names it in Location", async () => {
    const host = serving();

    const response = await create(host, { name: "The vault" });
    expect(response.status).toBe(201);

    const declared = (await body(response)) as Declared;
    expect(declared).toMatchObject({ name: "The vault", retired: false });
    expect(response.headers.get("location")).toBe(
      `/v1/destinations/${declared.id}`,
    );
  });

  it("refuses a kind this daemon has no adapter for", async () => {
    const host = serving();

    const response = await create(host, { kind: "kanban", settings: {} });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-destination-kind", destinationKind: "kanban" },
    });
  });

  it("refuses settings the kind's schema declines, carrying the issues", async () => {
    const host = serving();

    const response = await create(host, { settings: { depth: 2 } });

    expect(response.status).toBe(422);
    const refused = (await body(response)) as {
      error: { code: string; issues: unknown[] };
    };
    expect(refused.error.code).toBe("invalid-destination-settings");
    expect(refused.error.issues).toContainEqual({
      path: "/root",
      keyword: "required",
    });
  });

  /** A name is a label, so two destinations may share one: a record names the id. */
  it("takes a second destination under a name already in use", async () => {
    const host = serving();
    await created(host);

    expect((await create(host)).status).toBe(201);
    expect(await list(host)).toHaveLength(2);
  });
});

describe("PATCH /v1/destinations/{id}", () => {
  it("renames without disturbing the settings", async () => {
    const host = serving();
    const vault = await created(host);

    const response = await host.app.request(`/v1/destinations/${vault.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Second brain" }),
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      name: "Second brain",
      settings: { root: host.vaultRoot },
    });
  });

  /** An edit takes effect on the next call: there is no instance to invalidate. */
  it("reconfigures, and the next delivery runs against the new settings", async () => {
    const host = serving("ready");
    const vault = await created(host, { settings: { root: "/nowhere" } });
    const [item] = await captureMany(host.app, 1);

    const first = await send(host.app, `/v1/items/${item}/route`, {
      destination: vault.id,
      capability: "create-file",
      arguments: { directory: "inbox", filename: "a.md" },
    });
    expect(((await body(first)) as { state: string }).state).toBe("pending");

    await host.app.request(`/v1/destinations/${vault.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: { root: host.vaultRoot } }),
    });

    expect(await host.deliver()).toBe(1);
    const records = (await body(
      await host.app.request(`/v1/items/${item}/routing`),
    )) as { values: { state: string }[] };
    expect(records.values[0]?.state).toBe("delivered");
  });

  it("refuses settings the kind declines, and writes nothing", async () => {
    const host = serving();
    const vault = await created(host);

    const response = await host.app.request(`/v1/destinations/${vault.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: { depth: 2 } }),
    });

    expect(response.status).toBe(422);
    expect((await list(host))[0]?.settings).toEqual({ root: host.vaultRoot });
  });

  it("is 404 for an id no destination has", async () => {
    const host = serving();

    const response = await host.app.request("/v1/destinations/nobody", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ghost" }),
    });

    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-destination", destination: "nobody" },
    });
  });
});

describe("GET /v1/destinations/{id}/description", () => {
  it("answers what the adapter for its kind declares", async () => {
    const host = serving("ready");
    const vault = await created(host);

    const response = await host.app.request(
      `/v1/destinations/${vault.id}/description`,
    );
    expect(response.status).toBe(200);

    const described = (await body(response)) as {
      kind: string;
      capabilities: { name: string; argumentsSchema: object }[];
    };
    expect(described.kind).toBe("described");
    expect(described.capabilities.map((each) => each.name)).toEqual([
      "create-file",
      "append-to-file",
    ]);
    expect(described.capabilities[0]?.argumentsSchema).toMatchObject({
      required: ["directory"],
    });
  });

  it("is 404 for an id no destination has", async () => {
    const host = serving();

    const response = await host.app.request(
      "/v1/destinations/nobody/description",
    );
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-destination" },
    });
  });
});

describe("GET /v1/destinations/{id}/candidates", () => {
  async function ask(
    host: Daemon,
    destination: string,
    query: Record<string, string>,
  ): Promise<Response> {
    const search = new URLSearchParams(query).toString();
    return host.app.request(
      `/v1/destinations/${destination}/candidates?${search}`,
    );
  }

  it("answers what an askable field could hold", async () => {
    const host = serving("ready");
    mkdirSync(join(host.vaultRoot, "inbox"));
    const vault = await created(host);

    const response = await ask(host, vault.id, {
      capability: "create-file",
      field: "directory",
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      kind: "answered",
      truncated: false,
      entries: [{ label: "inbox", value: "inbox", scope: "inbox" }],
    });
  });

  it("refuses a capability the destination never declared, before asking it anything", async () => {
    const host = serving("ready");
    const vault = await created(host);

    const response = await ask(host, vault.id, {
      capability: "delete-file",
      field: "directory",
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "capability-undeclared", capability: "delete-file" },
    });
  });

  it("refuses a field that does not carry x-notemap-candidates", async () => {
    const host = serving("ready");
    const vault = await created(host);

    const response = await ask(host, vault.id, {
      capability: "create-file",
      field: "filename",
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: {
        code: "field-not-askable",
        capability: "create-file",
        field: "filename",
      },
    });
  });

  it("is unreachable rather than an error where the destination could not be asked", async () => {
    const host = serving();
    const vault = await created(host);

    const response = await ask(host, vault.id, {
      capability: "create-file",
      field: "directory",
    });

    expect(response.status).toBe(200);
    const answered = (await body(response)) as { kind: string; detail: string };
    expect(answered.kind).toBe("unreachable");
    expect(answered.detail).toContain(host.vaultRoot);
  });

  it("is unusable where the root overlaps notemap's own state", async () => {
    const host = serving();
    const vault = await created(host, { settings: { root: host.assetRoot } });

    const response = await ask(host, vault.id, {
      capability: "create-file",
      field: "directory",
    });

    expect(response.status).toBe(200);
    const answered = (await body(response)) as { kind: string; detail: string };
    expect(answered.kind).toBe("unusable");
    expect(answered.detail).toContain("overlaps");
  });

  it("is 404 for an id no destination has", async () => {
    const host = serving();

    const response = await ask(host, "nobody", {
      capability: "create-file",
      field: "directory",
    });

    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-destination" },
    });
  });
});

describe("retiring and offering again", () => {
  it("stops new routing and leaves the row exactly where it was", async () => {
    const host = serving("ready");
    const vault = await created(host);
    const [item] = await captureMany(host.app, 1);

    expect(
      (await send(host.app, `/v1/destinations/${vault.id}/retire`)).status,
    ).toBe(200);

    const refused = await send(host.app, `/v1/items/${item}/route`, {
      destination: vault.id,
      capability: "create-file",
      arguments: { directory: "inbox" },
    });
    expect(refused.status).toBe(409);
    expect(await body(refused)).toMatchObject({
      error: { code: "destination-retired", destination: vault.id },
    });
  });

  it("offers it again, and routing works once more", async () => {
    const host = serving("ready");
    const vault = await created(host);
    const [item] = await captureMany(host.app, 1);
    await send(host.app, `/v1/destinations/${vault.id}/retire`);

    const offered = await send(
      host.app,
      `/v1/destinations/${vault.id}/unretire`,
    );
    expect(offered.status).toBe(200);
    expect(await body(offered)).toMatchObject({ retired: false });

    const routed = await send(host.app, `/v1/items/${item}/route`, {
      destination: vault.id,
      capability: "create-file",
      arguments: { directory: "inbox" },
    });
    expect(routed.status).toBe(200);
  });

  /** A second would overwrite the instant the first recorded. */
  it("refuses retiring one that is already retired", async () => {
    const host = serving();
    const vault = await created(host);
    await send(host.app, `/v1/destinations/${vault.id}/retire`);

    const again = await send(host.app, `/v1/destinations/${vault.id}/retire`);
    expect(again.status).toBe(409);
    expect(await body(again)).toMatchObject({
      error: { code: "already-retired" },
    });
  });

  it("refuses offering one that was never retired", async () => {
    const host = serving();
    const vault = await created(host);

    const response = await send(
      host.app,
      `/v1/destinations/${vault.id}/unretire`,
    );
    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      error: { code: "not-retired" },
    });
  });

  it("is 404 for an id no destination has", async () => {
    const host = serving();

    expect(
      (await send(host.app, "/v1/destinations/nobody/retire")).status,
    ).toBe(404);
  });
});

describe("DELETE /v1/destinations/{id}", () => {
  it("removes one no record has ever named", async () => {
    const host = serving();
    const vault = await created(host);

    const response = await host.app.request(`/v1/destinations/${vault.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(await list(host)).toEqual([]);
  });

  it("refuses one a record names, which retirement is the answer to", async () => {
    const host = serving("ready");
    const vault = await created(host);
    const [item] = await captureMany(host.app, 1);
    await send(host.app, `/v1/items/${item}/route`, {
      destination: vault.id,
      capability: "create-file",
      arguments: { directory: "inbox" },
    });

    const response = await host.app.request(`/v1/destinations/${vault.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      error: { code: "destination-in-use", destination: vault.id },
    });
    expect(await list(host)).toHaveLength(1);
  });

  it("is 404 for an id no destination has", async () => {
    const host = serving();

    const response = await host.app.request("/v1/destinations/nobody", {
      method: "DELETE",
    });
    expect(response.status).toBe(404);
  });
});
