import { describe, expect, it } from "vitest";

import { daemons, IMAGE_SOURCE } from "./harness/index.ts";

const daemon = daemons();

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("bytes uploaded by the client", () => {
  it("come back from the URL the client says they are at", async () => {
    const running = await daemon();
    const client = running.client;

    const asset = await client.uploadAsset(
      new File([BYTES], "whiteboard.png", { type: "image/png" }),
    );
    const captured = await client.capture({
      channel: IMAGE_SOURCE,
      text: "before anyone rubbed it out",
      asset: asset.id,
    });
    await client.drain();

    const served = await fetch(client.assetContent(asset.id));

    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(BYTES);

    // The item the pool holds names the asset, so the two halves agree.
    const item = await client.item(captured.id);
    expect(item?.payload.assets).toEqual([{ slot: "image", asset: asset.id }]);
  });
});
