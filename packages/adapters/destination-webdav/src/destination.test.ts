import type { DeliveryOutcome, PayloadTypeName } from "@notemap/core";
import { linkTo, type Renderer } from "@notemap/output-markdown";
import { afterEach, describe, expect, it } from "vitest";

import { createWebdavDestination } from "./destination";
import {
  bytes,
  deliveredAsset,
  delivery,
  destinationRow,
  resolverFor,
  TEXT,
} from "./testing/fixture";
import { startDavServer, type DavServer } from "./testing/dav-server";

const servers: DavServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function vault(): Promise<DavServer> {
  const server = await startDavServer();
  servers.push(server);
  return server;
}

const IMAGE = "image" as PayloadTypeName;

/** Links every asset it was handed, so the names they landed under are visible. */
const renderWithAssets: Renderer = (_delivery, where) => ({
  body: [...where.assets.values()]
    .map((name) => `![](${linkTo(name)})`)
    .join("\n"),
});

function adapter(server: DavServer, renderers = {}) {
  return createWebdavDestination({
    accepts: [TEXT, IMAGE],
    credentials: resolverFor(server),
    renderers,
  });
}

describe("reaching the account", () => {
  it("reports a profile nothing declares as unreachable, naming it", async () => {
    const server = await vault();

    const outcome = await adapter(server).deliver(
      destinationRow({ profile: "not-declared", root: "" }),
      delivery(),
    );

    expect(outcome).toEqual<DeliveryOutcome>({
      kind: "unreachable",
      detail: "no webdav profile named not-declared",
    });
    expect(server.requests()).toEqual([]);
  });

  it("rejects settings it cannot read, which no later attempt fixes", async () => {
    const server = await vault();
    const row = { ...destinationRow({ root: "" }), settings: {} };

    expect(await adapter(server).deliver(row, delivery())).toMatchObject({
      kind: "rejected",
    });
  });

  it("rejects a capability it does not have", async () => {
    const server = await vault();

    expect(
      await adapter(server).deliver(
        destinationRow({ root: "" }),
        delivery({ capability: "post-to-board" }),
      ),
    ).toMatchObject({ kind: "rejected", detail: /post-to-board/ });
  });
});

describe("creating a note", () => {
  it("writes the note under the vault's root, and points at it relatively", async () => {
    const server = await vault();
    server.makeCollection("Notes/Vault/inbox");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "Notes/Vault" }),
      delivery({ arguments: { directory: "inbox", filename: "a note.md" } }),
    );

    expect(outcome).toMatchObject({
      kind: "delivered",
      pointer: "inbox/a note.md",
    });
    expect(Object.keys(server.files())).toEqual([
      "Notes/Vault/inbox/a note.md",
    ]);
  });

  it("writes the frontmatter and the rendering the filesystem kind writes", async () => {
    const server = await vault();
    server.makeCollection("V");

    await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        arguments: { directory: "", filename: "note.md" },
        tags: ["project/fiction-a"],
      }),
    );

    const note = server.files()["V/note.md"] ?? "";
    expect(note).toContain("id: 'item-1'");
    expect(note).toContain("captured_at: '2026-09-01T14:23:05.000Z'");
    expect(note).toContain("derived_from: 'urn:commons:item:item-1'");
    expect(note).toContain("- 'project/fiction-a'");
  });

  it("derives a filename where the delivery names none", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        arguments: { directory: "" },
        content: { text: "# A thought\nand more of it" },
      }),
    );

    expect(outcome).toMatchObject({ pointer: "A thought.md" });
  });

  it("refuses a name that is taken rather than writing over it", async () => {
    const server = await vault();
    server.put("V/note.md", "somebody else's note");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({ arguments: { directory: "", filename: "note.md" } }),
    );

    expect(outcome).toMatchObject({
      kind: "rejected",
      detail: "note.md is already there",
    });
    expect(server.files()["V/note.md"]).toBe("somebody else's note");
  });

  it("makes a folder three levels deep that is not there, level by level", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        arguments: { directory: "a/b/c", filename: "note.md" },
      }),
    );

    expect(outcome).toMatchObject({ pointer: "a/b/c/note.md" });
    expect(server.collections()).toContain("V/a/b");
    expect(
      server.requests().filter((each) => each.startsWith("MKCOL")),
    ).toEqual(["MKCOL /V/a", "MKCOL /V/a/b", "MKCOL /V/a/b/c"]);
  });

  /** The vault is somebody's own folder: one that is not there is reported, never conjured. */
  it("reports a root that is not there as unreachable", async () => {
    const server = await vault();

    expect(
      await adapter(server).deliver(
        destinationRow({ root: "not/made" }),
        delivery({ arguments: { directory: "", filename: "note.md" } }),
      ),
    ).toMatchObject({ kind: "unreachable" });
    expect(server.files()).toEqual({});
  });

  /** The condition is the whole of it: asking first and then writing would lose one silently. */
  it("leaves one note and one refusal where two creates race for a name", async () => {
    const server = await vault();
    server.makeCollection("V");

    const create = (item: string) =>
      adapter(server).deliver(
        destinationRow({ root: "V" }),
        delivery({
          item,
          arguments: { directory: "", filename: "note.md" },
          content: { text: item },
        }),
      );

    const outcomes = await Promise.all([create("first"), create("second")]);

    expect(outcomes.map((each) => each.kind).sort()).toEqual([
      "delivered",
      "rejected",
    ]);
    expect(Object.keys(server.files())).toEqual(["V/note.md"]);
  });

  it("refuses a target that leaves the vault, whatever a later attempt would find", async () => {
    const server = await vault();
    server.makeCollection("V");

    expect(
      await adapter(server).deliver(
        destinationRow({ root: "V" }),
        delivery({ arguments: { directory: "../..", filename: "note.md" } }),
      ),
    ).toMatchObject({ kind: "rejected", detail: /outside/ });
    expect(server.files()).toEqual({});
  });

  it("refuses arguments that are not a create-file argument set", async () => {
    const server = await vault();

    expect(
      await adapter(server).deliver(
        destinationRow({ root: "V" }),
        delivery({ arguments: { folder: "inbox" } }),
      ),
    ).toMatchObject({ kind: "rejected" });
  });
});

describe("appending to a note", () => {
  const append = (server: DavServer, args: Record<string, string>) =>
    adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({ capability: "append-to-file", arguments: args }),
    );

  it("inserts under the heading and keeps what was already there", async () => {
    const server = await vault();
    server.put("V/daily.md", "# Monday\n\n## Notes\n\nthe first one\n");

    const outcome = await append(server, {
      path: "daily.md",
      heading: "Notes",
    });

    expect(outcome).toMatchObject({ kind: "delivered", pointer: "daily.md" });
    expect(server.files()["V/daily.md"]).toBe(
      '# Monday\n\n## Notes\n\nthe first one\n\n```json\n{\n  "text": "a thought"\n}\n```\n',
    );
  });

  /** It is going into somebody else's file, which has its own. */
  it("carries no frontmatter into a note that was already there", async () => {
    const server = await vault();
    server.put("V/daily.md", "already here\n");

    await append(server, { path: "daily.md" });

    expect(server.files()["V/daily.md"]).not.toContain("derived_from");
  });

  it("writes a note that is not there, frontmatter and all", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await append(server, {
      path: "a/b/daily.md",
      heading: "Notes",
    });

    expect(outcome).toMatchObject({ pointer: "a/b/daily.md" });
    const note = server.files()["V/a/b/daily.md"] ?? "";
    expect(note).toContain("derived_from: 'urn:commons:item:item-1'");
    expect(note).toContain("## Notes");
  });

  /**
   * The lost update this kind is exposed to and the filesystem kind is not.
   * Somebody writes between the read and the write; the condition catches it,
   * and the re-read carries their line into the result.
   */
  it("does not lose a write that landed between the read and the write", async () => {
    const server = await vault();
    server.put("V/daily.md", "the first line\n");
    server.interceptOnce("PUT", () => {
      server.put("V/daily.md", "the first line\nsomebody else's line\n");
    });

    const outcome = await append(server, { path: "daily.md" });

    expect(outcome).toMatchObject({ kind: "delivered" });
    const note = server.files()["V/daily.md"] ?? "";
    expect(note).toContain("somebody else's line");
    expect(note).toContain('"text": "a thought"');
  });

  /**
   * Contention is retryable and the delivery runner's business. Rejecting would
   * abandon a routing decision at once over somebody else typing.
   */
  it("gives up as unreachable where every attempt loses the race", async () => {
    const server = await vault();
    server.put("V/daily.md", "the first line\n");

    let writes = 0;
    for (let each = 0; each < 8; each += 1) {
      server.interceptOnce("PUT", () => {
        writes += 1;
        server.put("V/daily.md", `written over ${writes}\n`);
      });
    }

    expect(await append(server, { path: "daily.md" })).toMatchObject({
      kind: "unreachable",
      detail: /4 attempts/,
    });
    expect(writes).toBe(4);
  });

  it("refuses a path that leaves the vault", async () => {
    const server = await vault();

    expect(await append(server, { path: "../elsewhere.md" })).toMatchObject({
      kind: "rejected",
      detail: /outside/,
    });
  });

  it("refuses arguments that are not an append-to-file argument set", async () => {
    const server = await vault();

    expect(await append(server, { note: "daily.md" })).toMatchObject({
      kind: "rejected",
    });
  });
});

describe("assets", () => {
  const withImages = (server: DavServer) =>
    adapter(server, { [IMAGE]: renderWithAssets });

  it("land beside the note under the names they were uploaded with", async () => {
    const server = await vault();
    server.makeCollection("V");
    const photo = deliveredAsset("image", "photo.png", bytes("PNG"));

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "inbox", filename: "a.md" },
        assets: [photo],
      }),
    );

    expect(Object.keys(server.files())).toEqual([
      "V/inbox/a.md",
      "V/inbox/photo.png",
    ]);
    expect(server.files()["V/inbox/photo.png"]).toBe("PNG");
    expect(server.files()["V/inbox/a.md"]).toContain("![](photo.png)");
  });

  it("suffixes the second of two sharing one name, rather than losing it", async () => {
    const server = await vault();
    server.makeCollection("V");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [
          deliveredAsset("one", "photo.png", bytes("first")),
          deliveredAsset("two", "photo.png", bytes("second")),
        ],
      }),
    );

    expect(Object.keys(server.files())).toEqual([
      "V/a.md",
      "V/photo-1.png",
      "V/photo.png",
    ]);
    expect(server.files()["V/photo-1.png"]).toBe("second");
  });

  it("writes beside a name the vault already had rather than over it", async () => {
    const server = await vault();
    server.put("V/photo.png", "theirs");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "photo.png", bytes("ours"))],
      }),
    );

    expect(server.files()["V/photo.png"]).toBe("theirs");
    expect(server.files()["V/photo-1.png"]).toBe("ours");
  });

  /** An uploaded filename was never promised to be one path segment. */
  it("flattens a name that would have left the vault", async () => {
    const server = await vault();
    server.makeCollection("V");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "../../authorized_keys", bytes("ours"))],
      }),
    );

    expect(Object.keys(server.files())).toEqual([
      "V/a.md",
      "V/authorized_keys",
    ]);
  });

  it("links to the copy beside the note, never back into notemap", async () => {
    const server = await vault();
    server.makeCollection("V");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "a photo.png", bytes("PNG"))],
      }),
    );

    // Angle brackets, because a bare CommonMark destination ends at the space.
    expect(server.files()["V/a.md"]).toContain("![](<a photo.png>)");
    expect(server.files()["V/a photo.png"]).toBe("PNG");
  });

  it("opens no stream for a delivery carrying none", async () => {
    const server = await vault();
    server.makeCollection("V");
    const photo = deliveredAsset("image", "photo.png", bytes("PNG"));

    await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({ arguments: { directory: "", filename: "a.md" } }),
    );

    expect(photo.opens()).toBe(0);
  });

  it("puts an asset beside a note being appended to as well", async () => {
    const server = await vault();
    server.put("V/daily.md", "the first line\n");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        capability: "append-to-file",
        arguments: { path: "daily.md" },
        assets: [deliveredAsset("one", "photo.png", bytes("PNG"))],
      }),
    );

    expect(server.files()["V/photo.png"]).toBe("PNG");
    expect(server.files()["V/daily.md"]).toContain("![](photo.png)");
  });

  /** Uploaded once even where the note has to be re-read and written again. */
  it("does not upload an asset a second time when an append loses a race", async () => {
    const server = await vault();
    server.put("V/daily.md", "the first line\n");
    const photo = deliveredAsset("one", "photo.png", bytes("PNG"));

    server.interceptOnce("PUT", () => undefined); // the asset's own PUT
    server.interceptOnce("PUT", () => {
      server.put("V/daily.md", "somebody else got there\n");
    });

    const outcome = await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        capability: "append-to-file",
        arguments: { path: "daily.md" },
        assets: [photo],
      }),
    );

    expect(outcome).toMatchObject({ kind: "delivered" });
    expect(photo.opens()).toBe(1);
  });
});

/**
 * `DeliveredAsset.open` is lazy because a delivery may be carrying an hour of
 * audio, and the whole of that is given up if the bytes are gathered into one
 * buffer to be measured before the request goes.
 */
describe("an asset is streamed, not buffered", () => {
  it("sends the bytes chunked, with no length taken first", async () => {
    const server = await vault();
    server.makeCollection("V");

    await adapter(server, { [IMAGE]: renderWithAssets }).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "long.wav", bytes("many bytes"))],
      }),
    );

    expect(server.arrivedChunked("V/long.wav")).toBe(true);
    // The note is a string the adapter already holds, so it is measured.
    expect(server.arrivedChunked("V/a.md")).toBe(false);
  });
});
