import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { daemon, put, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function host(options: Parameters<typeof daemon>[1] = {}): Daemon {
  const started = daemon(undefined, options);
  open.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((started) => started.cleanup()));
});

function attachment(filename: string): string {
  return `attachment; filename="${filename}"`;
}

function digestOf(content: string | Uint8Array): string {
  return `sha-256=:${createHash("sha256").update(content).digest("base64")}:`;
}

type ErrorResponse = { error: { code: string } };

type StoredAsset = {
  id: string;
  filename: string;
  mime: string;
  blob: string;
  bytes: number;
};

async function upload(
  started: Daemon,
  content: string | Uint8Array,
  headers: Record<string, string>,
): Promise<StoredAsset> {
  const response = await put(started.app, content, headers);
  if (response.status !== 201) {
    throw new Error(
      `upload failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as StoredAsset;
}

describe("POST /v1/assets", () => {
  it("stores the bytes and answers the asset", async () => {
    const started = host();

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });
    const asset = (await response.json()) as StoredAsset;

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/v1/assets/${asset.id}`);
    expect(asset).toMatchObject({
      filename: "photo.png",
      mime: "image/png",
      bytes: 9,
    });
  });

  it("round-trips content that is not valid UTF-8", async () => {
    const started = host();
    const content = new Uint8Array([0, 0xff, 0xfe, 0x80, 0x00, 0xc0]);

    const asset = await upload(started, content, {
      "content-type": "application/octet-stream",
      "content-disposition": attachment("raw.bin"),
    });
    const response = await started.app.request(
      `/v1/assets/${asset.id}/content`,
    );

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(content);
  });

  it("keeps a filename that is not ASCII, through the extended form", async () => {
    const started = host();

    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition":
        "attachment; filename=\"na_ve.png\"; filename*=UTF-8''na%C3%AFve%20%F0%9F%93%B7.png",
    });

    expect(asset.filename).toBe("naïve 📷.png");
    const response = await started.app.request(
      `/v1/assets/${asset.id}/content`,
    );
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''na%C3%AFve%20%F0%9F%93%B7.png",
    );
  });

  it("gives two names over one content two assets and one blob", async () => {
    const started = host();

    const mine = await upload(started, "the same picture", {
      "content-type": "image/png",
      "content-disposition": attachment("mum.png"),
    });
    const theirs = await upload(started, "the same picture", {
      "content-type": "image/png",
      "content-disposition": attachment("dad.png"),
    });

    expect(mine.id).not.toBe(theirs.id);
    expect(mine.blob).toBe(theirs.blob);
    expect(mine.filename).toBe("mum.png");
    expect(theirs.filename).toBe("dad.png");
  });

  it("refuses an upload with no filename", async () => {
    const started = host();

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "missing-filename" },
    });
  });

  it("refuses a Content-Disposition carrying no filename at all", async () => {
    const started = host();

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
      "content-disposition": "attachment",
    });

    expect(response.status).toBe(422);
  });

  it("refuses an upload with no media type", async () => {
    const started = host();

    const response = await started.app.request("/v1/assets", {
      method: "POST",
      headers: { "content-disposition": attachment("photo.png") },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(415);
    expect(((await response.json()) as ErrorResponse).error.code).toBe(
      "unsupported-media-type",
    );
  });

  it("accepts a Repr-Digest that agrees with the bytes", async () => {
    const started = host();

    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
      "repr-digest": digestOf("a picture"),
    });

    expect(asset.blob).toBe(
      createHash("sha256").update("a picture").digest("hex"),
    );
  });

  it("refuses a Repr-Digest that does not, and stores nothing", async () => {
    const started = host();

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
      "repr-digest": digestOf("a different picture"),
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error.code).toBe("digest-mismatch");
    expect(
      await started.blobs.verify(
        createHash("sha256").update("a picture").digest("hex") as never,
      ),
    ).toBe("missing");
  });

  it("ignores a digest in an algorithm it does not understand", async () => {
    const started = host();

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
      "repr-digest": "sha-512=:bm90IGEgc2hhLTI1Ng==:",
    });

    expect(response.status).toBe(201);
  });

  it.each([
    ["not base64 at all", "sha-256=:!!!!:"],
    ["too few bytes to be a sha-256", "sha-256=:YWJj:"],
    ["missing the byte-sequence colons", "sha-256=YWJj"],
    ["empty", "sha-256=::"],
  ])("refuses a sha-256 digest that is %s", async (_case, header) => {
    const started = host();

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
      "repr-digest": header,
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error.code).toBe("bad-digest");
    expect(
      await started.blobs.verify(
        createHash("sha256").update("a picture").digest("hex") as never,
      ),
    ).toBe("missing");
  });

  it("refuses a body over the limit, and leaves no blob behind", async () => {
    const started = host({ maxUploadBytes: 8 });

    const response = await put(started.app, "far more than eight bytes", {
      "content-type": "text/plain",
      "content-disposition": attachment("long.txt"),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: "asset-too-large", max: 8 },
    });
    expect(
      await started.blobs.verify(
        createHash("sha256")
          .update("far more than eight bytes")
          .digest("hex") as never,
      ),
    ).toBe("missing");
  });

  it("accepts a body exactly at the limit", async () => {
    const started = host({ maxUploadBytes: 9 });

    const response = await put(started.app, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    expect(response.status).toBe(201);
  });

  it("does not lose the JSON guard on the capture route", async () => {
    const started = host();

    const response = await started.app.request("/v1/captures", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    expect(response.status).toBe(415);
  });
});

describe("GET /v1/assets/{id}", () => {
  it("answers the asset", async () => {
    const started = host();
    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    const response = await started.app.request(`/v1/assets/${asset.id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(asset);
  });

  it("is 404 for an id nobody minted", async () => {
    const started = host();

    const response = await started.app.request("/v1/assets/nobody-minted-this");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "no-such-asset", asset: "nobody-minted-this" },
    });
  });
});

describe("GET /v1/assets/{id}/content", () => {
  it("serves the recorded media type, the blob hash and an immutable cache", async () => {
    const started = host();
    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    const response = await started.app.request(
      `/v1/assets/${asset.id}/content`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe(`"${asset.blob}"`);
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(await response.text()).toBe("a picture");
  });

  it("carries nosniff and the sandbox CSP, whatever the media type", async () => {
    const started = host();
    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    const response = await started.app.request(
      `/v1/assets/${asset.id}/content`,
    );

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
  });

  it("renders a PNG in place and makes HTML a download", async () => {
    const started = host();
    const image = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });
    const page = await upload(started, "<script>alert(1)</script>", {
      "content-type": "text/html",
      "content-disposition": attachment("evil.html"),
    });

    const served = async (id: string) =>
      (await started.app.request(`/v1/assets/${id}/content`)).headers.get(
        "content-disposition",
      );

    expect(await served(image.id)).toContain("inline");
    expect(await served(page.id)).toContain("attachment");
  });

  it.each([
    ["image/x-icon", "favicon.ico"],
    ["image/vnd.microsoft.icon", "favicon.ico"],
    ["audio/wav", "memo.wav"],
    ["audio/x-wav", "memo.wav"],
    ["audio/vnd.wave", "memo.wav"],
  ])(
    "renders %s in place, whichever spelling it arrives under",
    async (mime, filename) => {
      const started = host();
      const asset = await upload(started, "some bytes", {
        "content-type": mime,
        "content-disposition": attachment(filename),
      });

      const response = await started.app.request(
        `/v1/assets/${asset.id}/content`,
      );
      expect(response.headers.get("content-disposition")).toContain("inline");
    },
  );

  it("sends no Content-Length, so a drifted blob cannot truncate a transfer", async () => {
    const started = host();
    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    const response = await started.app.request(
      `/v1/assets/${asset.id}/content`,
    );

    expect(response.headers.get("content-length")).toBeNull();
    expect(await response.text()).toBe("a picture");
  });

  it("makes SVG a download, and a media type nobody thought about too", async () => {
    const started = host();
    const svg = await upload(started, "<svg/>", {
      "content-type": "image/svg+xml",
      "content-disposition": attachment("drawing.svg"),
    });
    const unknown = await upload(started, "who knows", {
      "content-type": "application/x-notemap-invented",
      "content-disposition": attachment("mystery.bin"),
    });

    const served = async (id: string) =>
      (await started.app.request(`/v1/assets/${id}/content`)).headers.get(
        "content-disposition",
      );

    expect(await served(svg.id)).toContain("attachment");
    expect(await served(unknown.id)).toContain("attachment");
  });

  it("is 404 blob-missing when the bytes have gone from under the row", async () => {
    const started = host();
    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    await started.blobs.delete(asset.blob as never);

    const response = await started.app.request(
      `/v1/assets/${asset.id}/content`,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "blob-missing", blob: asset.blob },
    });
  });

  it("is 404 no-such-asset for an id nobody minted", async () => {
    const started = host();

    const response = await started.app.request(
      "/v1/assets/nobody-minted-this/content",
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorResponse).error.code).toBe(
      "no-such-asset",
    );
  });
});

describe("the sweep loop", () => {
  it("takes an upload no capture ever claimed, once its grace has passed", async () => {
    const started = host();
    const asset = await upload(started, "a picture", {
      "content-type": "image/png",
      "content-disposition": attachment("photo.png"),
    });

    // Inside the grace window, which the example config puts at a day.
    expect(await started.sweep()).toEqual([]);
    expect((await started.app.request(`/v1/assets/${asset.id}`)).status).toBe(
      200,
    );
  });
});
