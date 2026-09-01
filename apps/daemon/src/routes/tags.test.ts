import type { Hono } from "hono";
import type { AppEnv } from "../types";
import { afterEach, describe, expect, it } from "vitest";

import { captureMany, daemon, send, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function serving(): Hono<AppEnv> {
  const host = daemon();
  open.push(host);
  return host.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const body = (response: Response) => response.json() as Promise<never>;

describe("classification over the wire", () => {
  it("answers the item carrying the tag, attributed to an anonymous person", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/tag`, {
      tag: "project/fiction-a",
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      id: first,
      tags: [{ name: "project/fiction-a", by: { kind: "person" } }],
    });
  });

  it("carries a tag with a slash in it, which the body is why", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/tag`, { tag: "kind/quote" });

    const read = await app.request(`/v1/items/${first}`);

    expect(
      ((await body(read)) as { tags: { name: string }[] }).tags.map(
        (tag) => tag.name,
      ),
    ).toEqual(["kind/quote"]);
  });

  it("removes a tag, and answers the item without it", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/tag`, { tag: "kind/quote" });

    const response = await send(app, `/v1/items/${first}/untag`, {
      tag: "kind/quote",
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ id: first, tags: [] });
  });

  it("absorbs both halves rather than refusing them", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/tag`, { tag: "kind/quote" });

    const again = await send(app, `/v1/items/${first}/tag`, {
      tag: "kind/quote",
    });
    expect(again.status).toBe(200);
    expect(((await body(again)) as { tags: unknown[] }).tags).toHaveLength(1);

    await send(app, `/v1/items/${first}/untag`, { tag: "kind/quote" });
    const absent = await send(app, `/v1/items/${first}/untag`, {
      tag: "kind/quote",
    });
    expect(absent.status).toBe(200);
    expect(((await body(absent)) as { tags: unknown[] }).tags).toEqual([]);
  });

  it("answers 404 for an id no item has, either way round", async () => {
    const app = serving();

    const tagged = await send(app, "/v1/items/nobody/tag", { tag: "a" });
    expect(tagged.status).toBe(404);
    expect(await body(tagged)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
    expect(
      (await send(app, "/v1/items/nobody/untag", { tag: "a" })).status,
    ).toBe(404);
  });

  it("classifies an item something was revised from, either way round", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/tag`, { tag: "kind/quote" });
    await send(app, `/v1/items/${first}/mark-processed`);

    const edited = await send(app, `/v1/items/${first}/edit`, {
      source: "web",
      sourceItemId: "edit-1",
      payload: {
        type: "text",
        content: { text: "a second thought" },
        metadata: {},
        assets: [],
      },
    });
    const { revision } = (await body(edited)) as { revision: { id: string } };

    // Classification is not content, so nothing that seals a capture reaches it.
    const tagged = await send(app, `/v1/items/${first}/tag`, { tag: "kind/n" });
    expect(tagged.status).toBe(200);
    expect(
      (await send(app, `/v1/items/${first}/untag`, { tag: "kind/quote" }))
        .status,
    ).toBe(200);
    // The revision took the tags it was made with, and not the one added since.
    expect(
      (await send(app, `/v1/items/${revision.id}/tag`, { tag: "kind/n" }))
        .status,
    ).toBe(200);
  });

  it("refuses a body with no tag in it, a key it does not know, and a blank tag", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    expect((await send(app, `/v1/items/${first}/tag`)).status).toBe(400);
    const blank = await send(app, `/v1/items/${first}/tag`, { tag: "   " });
    expect(blank.status).toBe(422);
    expect(await body(blank)).toEqual({
      error: { code: "tag-invalid", tag: "   " },
    });
    expect(
      await body(await send(app, `/v1/items/${first}/tag`, { tag: "a", x: 1 })),
    ).toMatchObject({
      error: {
        code: "malformed-envelope",
        issues: [{ path: "/x", keyword: "additionalProperties" }],
      },
    });
  });
});

describe("the tags in use", () => {
  it("answers an empty list for a pool that has classified nothing", async () => {
    const app = serving();
    await captureMany(app, 1);

    const response = await app.request("/v1/tags");

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ values: [] });
  });

  it("answers every tag with its count, most used first", async () => {
    const app = serving();
    const [first, second] = await captureMany(app, 2);
    await send(app, `/v1/items/${first}/tag`, { tag: "kind/quote" });
    await send(app, `/v1/items/${first}/tag`, { tag: "project/fiction-a" });
    await send(app, `/v1/items/${second}/tag`, { tag: "kind/quote" });

    expect(await body(await app.request("/v1/tags"))).toEqual({
      values: [
        { name: "kind/quote", items: 2 },
        { name: "project/fiction-a", items: 1 },
      ],
    });
  });

  it("drops a tag the last item carrying it lost", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/tag`, { tag: "kind/quote" });
    await send(app, `/v1/items/${first}/untag`, { tag: "kind/quote" });

    expect(await body(await app.request("/v1/tags"))).toEqual({ values: [] });
  });
});
