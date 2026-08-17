import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import {
  captureMany,
  daemon,
  ids,
  send,
  slice,
  type Daemon,
} from "../testing/fixture";

const open: Daemon[] = [];

function serving(): Hono {
  const host = daemon();
  open.push(host);
  return host.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const body = (response: Response) => response.json() as Promise<never>;

function payload(text: string): unknown {
  return { type: "text", content: { text }, metadata: {}, assets: [] };
}

describe("editing over the wire", () => {
  it("amends the unprocessed head in place", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(
      app,
      `/v1/items/${first}/edit`,
      payload("a second thought"),
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      kind: "amended",
      item: { id: first, payload: { content: { text: "a second thought" } } },
    });
  });

  it("appends a revision once a later capture has taken the head", async () => {
    const app = serving();
    const [first] = await captureMany(app, 2);

    const outcome = (await body(
      await send(app, `/v1/items/${first}/edit`, payload("a second thought")),
    )) as { kind: string; supersedes: string; revision: { id: string } };

    expect(outcome.kind).toBe("revised");
    expect(outcome.supersedes).toBe(first);
    expect(outcome.revision.id).not.toBe(first);
    // The original is superseded, so the queue holds the revision instead.
    expect(ids(await slice(app, "/v1/queue"))).toEqual([
      "0198f0c2-0000-7000-8000-000000000001",
      outcome.revision.id,
    ]);
  });

  it("refuses editing an item a revision already supersedes", async () => {
    const app = serving();
    const [first] = await captureMany(app, 2);
    const outcome = (await body(
      await send(app, `/v1/items/${first}/edit`, payload("x")),
    )) as { revision: { id: string } };

    const again = await send(app, `/v1/items/${first}/edit`, payload("y"));

    expect(again.status).toBe(409);
    expect(await body(again)).toEqual({
      error: { code: "item-superseded", by: outcome.revision.id },
    });
  });

  it("refuses a payload of a different type from the one it was captured as", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/edit`, {
      type: "voice",
      content: { text: "x" },
      metadata: {},
      assets: [],
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "payload-type-changed", from: "text" },
    });
  });

  it("refuses a payload that does not satisfy its type's schema", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/edit`, {
      type: "text",
      content: { text: "" },
      metadata: {},
      assets: [],
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "payload-invalid" },
    });
  });

  it("refuses an attachment the pool does not hold", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/edit`, {
      type: "text",
      content: { text: "a thought" },
      metadata: {},
      assets: [{ slot: "image", asset: "nothing" }],
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "unknown-asset", asset: "nothing" },
    });
  });

  it("answers 404 for an id no item has", async () => {
    const app = serving();

    const response = await send(app, "/v1/items/nobody/edit", payload("x"));

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });

  it("refuses a body that is not a payload", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/edit`, {
      text: "just the words",
    });

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: { code: "malformed-envelope" },
    });
  });
});
