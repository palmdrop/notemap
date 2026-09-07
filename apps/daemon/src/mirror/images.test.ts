import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { daemon, NOTE, put, WEB, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function host(): Daemon {
  const started = daemon(undefined, { mirroring: true });
  open.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((started) => started.cleanup()));
});

async function upload(
  started: Daemon,
  filename: string,
  content: string,
  mime = "image/png",
): Promise<{ id: string; blob: string }> {
  const response = await put(started.app, content, {
    "content-type": mime,
    "content-disposition": `attachment; filename="${filename}"`,
  });
  if (response.status !== 201) {
    throw new Error(`upload failed: ${await response.text()}`);
  }
  return (await response.json()) as { id: string; blob: string };
}

async function captureImage(started: Daemon, body: unknown): Promise<Response> {
  return started.app.request("/v1/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function envelopeFor(
  assets: readonly { slot: string; asset: string }[],
  text?: string,
  capturedAt = "2026-08-11T14:23:05.000Z",
) {
  const id = "0198f0c2-0000-7000-8000-000000000009";
  return {
    id,
    source: WEB,
    sourceItemId: id,
    capturedAt,
    payload: {
      type: NOTE,
      content: text === undefined ? {} : { text },
      metadata: {},
      assets,
    },
  };
}

function attaching(...assets: readonly string[]) {
  return assets.map((asset, index) => ({
    slot: String(index).padStart(3, "0"),
    asset,
  }));
}

async function renderingIn(
  root: string,
): Promise<{ path: string; text: string }> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const found = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(entry.parentPath, entry.name));

  const path = found[0];
  if (path === undefined) throw new Error("no rendering was written");
  return { path, text: await readFile(path, "utf8") };
}

/** The non-blank lines below the frontmatter the mirror writes above a rendering. */
function bodyOf(rendering: string): readonly string[] {
  const lines = rendering.trimEnd().split("\n");
  const closed = lines.indexOf("---", 1);
  return lines.slice(closed + 1).filter((line) => line !== "");
}

describe("capturing a note with attachments", () => {
  it("leaves a rendering pointing at a file that exists", async () => {
    const started = host();
    const asset = await upload(started, "photo.png", "a picture");

    expect(
      (await captureImage(started, envelopeFor(attaching(asset.id)))).status,
    ).toBe(201);
    expect(await started.drain()).toBe(1);

    const rendering = await renderingIn(started.mirrorRoot);
    const target = /!\[[^\]]*\]\(([^)]+)\)/.exec(rendering.text)?.[1];
    if (target === undefined) {
      throw new Error(`no image in the rendering:\n${rendering.text}`);
    }

    const pointed = resolve(dirname(rendering.path), target);
    await expect(access(pointed)).resolves.toBeUndefined();
    expect(await readFile(pointed, "utf8")).toBe("a picture");
  });

  it("points at the blob itself, not at a copy the mirror made", async () => {
    const started = host();
    const asset = await upload(started, "photo.png", "a picture");

    await captureImage(started, envelopeFor(attaching(asset.id)));
    await started.drain();

    const rendering = await renderingIn(started.mirrorRoot);
    const target = /!\[[^\]]*\]\(([^)]+)\)/.exec(rendering.text)?.[1] ?? "";

    expect(resolve(dirname(rendering.path), target)).toBe(
      started.blobs.pathFor(asset.blob as never),
    );
  });

  it("carries the filename as alt text, since a blob file has no name", async () => {
    const started = host();
    const asset = await upload(started, "interview-with-mum.png", "a picture");

    await captureImage(started, envelopeFor(attaching(asset.id)));
    await started.drain();

    expect((await renderingIn(started.mirrorRoot)).text).toContain(
      "![interview-with-mum.png](",
    );
  });

  it("writes the prose below the attachments", async () => {
    const started = host();
    const asset = await upload(started, "photo.png", "a picture");

    await captureImage(started, envelopeFor(attaching(asset.id), "mum, 1994"));
    await started.drain();

    const { text } = await renderingIn(started.mirrorRoot);
    expect(text.trimEnd().split("\n").at(-1)).toBe("mum, 1994");
  });

  it("resolves to the same file from a machine in another timezone", async () => {
    // Both halves of the link are computed from things a timezone cannot move:
    // the capture time in UTC, and the content's own hash.
    const written = async (zone: string) => {
      const previous = process.env.TZ;
      process.env.TZ = zone;
      try {
        const started = host();
        const asset = await upload(started, "photo.png", "a picture");
        await captureImage(started, envelopeFor(attaching(asset.id)));
        await started.drain();

        const { path, text } = await renderingIn(started.mirrorRoot);
        return { at: relative(started.mirrorRoot, path), text };
      } finally {
        process.env.TZ = previous;
      }
    };

    expect(await written("Pacific/Kiritimati")).toEqual(
      await written("Pacific/Niue"),
    );
  });

  it("draws an attachment that is not a picture as a link, not an embed", async () => {
    const started = host();
    const picture = await upload(started, "photo.png", "a picture");
    const recording = await upload(
      started,
      "interview.opus",
      "some audio",
      "audio/opus",
    );

    await captureImage(
      started,
      envelopeFor(attaching(picture.id, recording.id)),
    );
    await started.drain();

    const lines = bodyOf((await renderingIn(started.mirrorRoot)).text);

    expect(lines[0]).toMatch(/^!\[photo\.png\]\(/);
    expect(lines[1]).toMatch(/^\[interview\.opus\]\(/);
  });
});
