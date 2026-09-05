import { afterEach, describe, expect, it } from "vitest";

import { captureMany, daemon, send, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function serving(): Daemon {
  const host = daemon(undefined, { vault: "ready" });
  open.push(host);
  return host;
}

const body = (response: Response) => response.json() as Promise<never>;

type Declared = {
  id: string;
  name: string;
  destination: string;
  capability: string;
  arguments: Record<string, unknown>;
  folder: "create" | "require" | "establish";
  triggerTag?: string;
  establishedAt?: string;
};

async function vault(host: Daemon): Promise<string> {
  const response = await send(host.app, "/v1/destinations", {
    name: "Vault",
    kind: "filesystem",
    settings: { root: host.vaultRoot },
  });
  if (response.status !== 201) {
    throw new Error(`no vault: ${await response.text()}`);
  }
  return ((await body(response)) as { id: string }).id;
}

async function create(
  host: Daemon,
  destination: string,
  overrides: Partial<Omit<Declared, "id">> = {},
): Promise<Response> {
  return send(host.app, "/v1/templates", {
    name: overrides.name ?? "Research links",
    destination,
    capability: overrides.capability ?? "create-or-append-file",
    arguments: overrides.arguments ?? { path: "research/{{captured_at}}.md" },
    ...(overrides.folder === undefined ? {} : { folder: overrides.folder }),
    ...(overrides.triggerTag === undefined
      ? {}
      : { triggerTag: overrides.triggerTag }),
  });
}

async function created(
  host: Daemon,
  destination: string,
  overrides: Partial<Omit<Declared, "id">> = {},
): Promise<Declared> {
  const response = await create(host, destination, overrides);
  if (response.status !== 201) {
    throw new Error(`refused: ${await response.text()}`);
  }
  return (await body(response)) as Declared;
}

async function list(host: Daemon): Promise<Declared[]> {
  const answered = (await body(await host.app.request("/v1/templates"))) as {
    values: Declared[];
  };
  return answered.values;
}

describe("the templates a pool holds", () => {
  it("answers what was saved, with its patterns unexpanded", async () => {
    const host = serving();
    const destination = await vault(host);

    const made = await created(host, destination);

    expect(made).toMatchObject({
      name: "Research links",
      destination,
      capability: "create-or-append-file",
      arguments: { path: "research/{{captured_at}}.md" },
      folder: "create",
    });
    expect(await list(host)).toHaveLength(1);
  });

  it("names the template it made in Location", async () => {
    const host = serving();
    const destination = await vault(host);

    const response = await create(host, destination);

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toMatch(/^\/v1\/templates\/.+/);
  });

  it("refuses a trigger tag outside the reserved namespace", async () => {
    const host = serving();
    const destination = await vault(host);

    const response = await create(host, destination, {
      triggerTag: "research",
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "trigger-tag-unreserved" },
    });
  });

  it("answers 409 where another template already claims the tag", async () => {
    const host = serving();
    const destination = await vault(host);
    await created(host, destination, { triggerTag: "route/research" });

    const response = await create(host, destination, {
      triggerTag: "route/research",
    });

    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      error: { code: "trigger-tag-taken" },
    });
  });

  it("refuses a pattern naming a field no item has", async () => {
    const host = serving();
    const destination = await vault(host);

    const response = await create(host, destination, {
      arguments: { path: "research/{{captured}}.md" },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-pattern-field", field: "captured" },
    });
  });

  it("changes what a person may change, and takes a tag off with null", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination, {
      triggerTag: "route/research",
    });

    const response = await host.app.request(`/v1/templates/${made.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Research", triggerTag: null }),
    });

    expect(response.status).toBe(200);
    const edited = (await body(response)) as Declared;
    expect(edited.name).toBe("Research");
    expect(edited.triggerTag).toBeUndefined();
  });

  it("deletes one, answering 204, and 404 for one that is not there", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination);

    const gone = await host.app.request(`/v1/templates/${made.id}`, {
      method: "DELETE",
    });
    const again = await host.app.request(`/v1/templates/${made.id}`, {
      method: "DELETE",
    });

    expect(gone.status).toBe(204);
    expect(again.status).toBe(404);
    expect(await list(host)).toEqual([]);
  });
});

describe("what a template's destination says now", () => {
  it("fits where the vault is there and takes the capability", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination);

    const response = await host.app.request(`/v1/templates/${made.id}/report`);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ kind: "fits" });
  });

  it("says stranded where the destination was deleted under it", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination);
    await host.app.request(`/v1/destinations/${destination}`, {
      method: "DELETE",
    });

    const response = await host.app.request(`/v1/templates/${made.id}/report`);

    expect(await body(response)).toEqual({ kind: "stranded" });
  });

  it("names the folder a required one is missing", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination, { folder: "require" });

    const response = await host.app.request(`/v1/templates/${made.id}/report`);

    expect(await body(response)).toEqual({
      kind: "folder-missing",
      folder: "research/",
    });
  });

  it("answers 404 for a template that is not there", async () => {
    const host = serving();

    const response = await host.app.request("/v1/templates/nobody/report");

    expect(response.status).toBe(404);
  });
});

describe("routing an item from a template", () => {
  it("answers what it would route as, expanding the patterns", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination);
    const [item] = await captureMany(host.app, 1);

    const response = await host.app.request(
      `/v1/items/${String(item)}/route/resolve?template=${made.id}`,
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      destination,
      capability: "create-or-append-file",
      arguments: { path: "research/2026-08-08.md" },
    });
  });

  it("takes a template in place of a destination on the route itself", async () => {
    const host = serving();
    const destination = await vault(host);
    const made = await created(host, destination);
    const [item] = await captureMany(host.app, 1);

    const response = await send(host.app, `/v1/items/${String(item)}/route`, {
      template: made.id,
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      state: "delivered",
      target: {
        kind: "destination",
        destination,
        arguments: { path: "research/2026-08-08.md" },
      },
      applied: { template: made.id, firedByTag: false },
    });
  });

  it("answers 404 for a template that is not there", async () => {
    const host = serving();
    const [item] = await captureMany(host.app, 1);

    const response = await send(host.app, `/v1/items/${String(item)}/route`, {
      template: "tpl-nobody",
    });

    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      error: { code: "unknown-template" },
    });
  });

  it("still takes a destination, a capability and arguments", async () => {
    const host = serving();
    const destination = await vault(host);
    const [item] = await captureMany(host.app, 1);

    const response = await send(host.app, `/v1/items/${String(item)}/route`, {
      destination,
      capability: "create-file",
      arguments: { directory: "inbox", filename: "a-thought.md" },
    });

    expect(response.status).toBe(200);
  });
});
