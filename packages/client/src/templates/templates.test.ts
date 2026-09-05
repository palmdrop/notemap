import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { RoutingTemplate } from "#api/types";
import { createClient } from "../client";
import { Unreachable } from "../errors";
import { read } from "#testing/observing";
import { asked as sentTo, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  return { client, transport };
}

function aTemplate(overrides: Partial<RoutingTemplate> = {}): RoutingTemplate {
  return {
    id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
    name: "Research links",
    destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a78",
    capability: "create-or-append-file",
    arguments: { path: "research/{{captured_at}}.md" },
    folder: "create",
    triggerTag: "route/research",
    ...overrides,
  };
}

const asked = (transport: { sent: readonly Request[] }) =>
  sentTo(transport).map(routeOf);

describe("reading templates", () => {
  it("fills the cache a composer offers from", async () => {
    const template = aTemplate();
    const { client } = clientOver(() => json(200, { values: [template] }));

    expect(read(client.templates.all)).toEqual([]);
    expect(await client.templates.load()).toEqual([template]);
    expect(read(client.templates.all)).toEqual([template]);
    expect(client.templates.held).toEqual([template]);
  });

  it("keeps offering what it last saw once the pool goes away", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [aTemplate()] }),
    );
    await client.templates.load();

    transport.unreachable(true);
    await expect(client.templates.load()).rejects.toBeInstanceOf(Unreachable);

    expect(read(client.templates.all)).toEqual([aTemplate()]);
  });

  it("asks nothing about whether one still fits until it is asked", async () => {
    const { client, transport } = clientOver((request) =>
      request.url.endsWith("/report")
        ? json(200, { kind: "fits" })
        : json(200, { values: [aTemplate()] }),
    );

    await client.templates.load();
    expect(asked(transport)).toEqual(["GET /v1/templates"]);

    expect(await client.templates.report(aTemplate().id)).toEqual({
      kind: "fits",
    });
    expect(asked(transport)).toEqual([
      "GET /v1/templates",
      `GET /v1/templates/${aTemplate().id}/report`,
    ]);
  });

  it("reads a stranded one as an answer rather than as a failure", async () => {
    const { client } = clientOver(() => json(200, { kind: "stranded" }));

    expect(await client.templates.report(aTemplate().id)).toEqual({
      kind: "stranded",
    });
  });

  it("asks the pool what one would route as, rather than expanding here", async () => {
    const { client, transport } = clientOver(() =>
      json(200, {
        destination: aTemplate().destination,
        capability: "create-or-append-file",
        arguments: { path: "research/2026-09-05.md" },
      }),
    );

    const resolved = await client.templates.resolve("item-1", aTemplate().id);

    expect(resolved.arguments).toEqual({ path: "research/2026-09-05.md" });
    expect(asked(transport)).toEqual(["GET /v1/items/item-1/route/resolve"]);
  });
});

describe("changing templates", () => {
  it("keeps the cache current without a second read", async () => {
    const made = aTemplate();
    const { client, transport } = clientOver(() => json(201, made));

    await client.templates.create({
      name: made.name,
      destination: made.destination,
      capability: made.capability,
      arguments: made.arguments,
    });

    expect(read(client.templates.all)).toEqual([made]);
    expect(asked(transport)).toEqual(["POST /v1/templates"]);
  });

  it("replaces the one it edited where it stood", async () => {
    const made = aTemplate();
    const renamed = { ...made, name: "Research" };
    const { client } = clientOver((request) =>
      request.method === "PATCH" ? json(200, renamed) : json(201, made),
    );
    await client.templates.create({
      name: made.name,
      destination: made.destination,
      capability: made.capability,
      arguments: made.arguments,
    });

    await client.templates.update(made.id, { name: "Research" });

    expect(read(client.templates.all)).toEqual([renamed]);
  });

  it("drops the one it deleted", async () => {
    const made = aTemplate();
    const { client } = clientOver((request) =>
      request.method === "DELETE"
        ? new Response(null, { status: 204 })
        : json(201, made),
    );
    await client.templates.create({
      name: made.name,
      destination: made.destination,
      capability: made.capability,
      arguments: made.arguments,
    });

    await client.templates.delete(made.id);

    expect(read(client.templates.all)).toEqual([]);
  });
});
