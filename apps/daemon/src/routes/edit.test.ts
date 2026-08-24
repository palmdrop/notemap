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

/** What an edit carries: the source making it, its own id for it, and the words. */
function envelope(text: string, sourceItemId = "edit-1"): unknown {
  return { source: "web", sourceItemId, payload: payload(text) };
}

describe("editing over the wire", () => {
  it("amends an unprocessed item in place, however old it is", async () => {
    const app = serving();
    const [first] = await captureMany(app, 3);

    const response = await send(
      app,
      `/v1/items/${first}/edit`,
      envelope("a second thought"),
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      kind: "amended",
      item: { id: first, payload: { content: { text: "a second thought" } } },
    });
  });

  it("appends a revision once the item has been processed", async () => {
    const app = serving();
    const [first, second] = await captureMany(app, 2);
    await send(app, `/v1/items/${first}/mark-processed`);

    const outcome = (await body(
      await send(app, `/v1/items/${first}/edit`, envelope("a second thought")),
    )) as { kind: string; revisionOf: string; revision: { id: string } };

    expect(outcome.kind).toBe("revised");
    expect(outcome.revisionOf).toBe(first);
    expect(outcome.revision.id).not.toBe(first);
    // The revision arrives at the newest end, by its own capture time.
    expect(ids(await slice(app, "/v1/queue"))).toEqual([
      second,
      outcome.revision.id,
    ]);
  });

  it("answers the revision it already made when the edit is retried", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/mark-processed`);

    const once = (await body(
      await send(app, `/v1/items/${first}/edit`, envelope("a second thought")),
    )) as { revision: { id: string } };
    const again = await send(
      app,
      `/v1/items/${first}/edit`,
      envelope("a second thought"),
    );

    expect(again.status).toBe(200);
    expect(await body(again)).toMatchObject({
      kind: "revised",
      revisionOf: first,
      revision: { id: once.revision.id },
    });
  });

  it("names both revisions on the item they were made from", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/mark-processed`);

    const one = (await body(
      await send(app, `/v1/items/${first}/edit`, envelope("one", "edit-1")),
    )) as { revision: { id: string } };
    const two = (await body(
      await send(app, `/v1/items/${first}/edit`, envelope("two", "edit-2")),
    )) as { revision: { id: string } };

    const held = await (await app.request(`/v1/items/${first}`)).json();
    expect(held).toMatchObject({
      revisedInto: [one.revision.id, two.revision.id],
    });
  });

  it("refuses a source identity another item already claims", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/mark-processed`);

    const response = await send(
      app,
      `/v1/items/${first}/edit`,
      envelope("a second thought", first),
    );

    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      error: { code: "source-item-changed", existing: first },
    });
  });

  it("refuses a payload of a different type from the one it was captured as", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/edit`, {
      source: "web",
      sourceItemId: "edit-1",
      payload: { type: "voice", content: { text: "x" }, metadata: {}, assets: [] },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "payload-type-changed", from: "text" },
    });
  });

  it("refuses a payload that does not satisfy its type's schema", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(
      app,
      `/v1/items/${first}/edit`,
      envelope(""),
    );

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "payload-invalid" },
    });
  });

  it("refuses an attachment the pool does not hold", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/edit`, {
      source: "web",
      sourceItemId: "edit-1",
      payload: {
        type: "text",
        content: { text: "a thought" },
        metadata: {},
        assets: [{ slot: "image", asset: "nothing" }],
      },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "unknown-asset", asset: "nothing" },
    });
  });

  it("answers 404 for an id no item has", async () => {
    const app = serving();

    const response = await send(app, "/v1/items/nobody/edit", envelope("x"));

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });

  it("refuses a body that is not an envelope", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const bare = await send(app, `/v1/items/${first}/edit`, payload("x"));
    expect(bare.status).toBe(400);
    expect(await body(bare)).toMatchObject({
      error: { code: "malformed-envelope" },
    });

    const unknownKey = await send(app, `/v1/items/${first}/edit`, {
      ...(envelope("x") as object),
      capturedAt: "2026-08-24T09:00:00.000Z",
    });
    expect(unknownKey.status).toBe(400);
  });
});
