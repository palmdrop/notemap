import { describe, expect, it } from "vitest";

import { daemons, IMAGE_SOURCE } from "./harness/index.ts";

const daemon = daemons();

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("bytes the client attached to a capture", () => {
  it("come back from the URL the client says they are at", async () => {
    const running = await daemon();
    const client = running.client;

    const asset = await client.attach(
      new File([BYTES], "whiteboard.png", { type: "image/png" }),
    );
    const captured = await client.capture({
      channel: IMAGE_SOURCE,
      text: "before anyone rubbed it out",
      asset,
    });
    await client.drain();

    const served = await fetch(client.assetContent(asset));

    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(BYTES);

    // The item the pool holds names the asset, so the two halves agree.
    const item = await client.item(captured.id);
    expect(item?.payload.assets).toEqual([{ slot: "image", asset }]);
  });
});

/**
 * Sent over `fetch` rather than through the client: the client mints an id per
 * upload, and what these are about is a second upload under an id already used.
 */
async function put(
  url: string,
  id: string,
  content: Uint8Array<ArrayBuffer>,
  filename = "whiteboard.png",
  mime = "image/png",
): Promise<Response> {
  return fetch(`${url}/v1/assets/${id}`, {
    method: "PUT",
    headers: {
      "content-type": mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
    body: content,
  });
}

describe("an upload under an id its uploader minted", () => {
  it("is 201, then 200 for the same bytes again, then 409 for anything else", async () => {
    const running = await daemon();
    const id = "0198f0c2-0001-7000-8000-00000000cafe";

    const first = await put(running.url, id, BYTES);
    expect(first.status).toBe(201);
    expect(first.headers.get("location")).toBe(`/v1/assets/${id}`);

    const replayed = await put(running.url, id, BYTES);
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual(await first.json());

    const renamed = await put(running.url, id, BYTES, "elsewhere.png");
    expect(renamed.status).toBe(409);
    expect(await renamed.json()).toEqual({
      error: { code: "asset-id-conflict", asset: id },
    });

    // The asset the pool holds is the one that landed first.
    const held = await fetch(`${running.url}/v1/assets/${id}`);
    expect(await held.json()).toMatchObject({ filename: "whiteboard.png" });
  });
});
