import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Rejected } from "@notemap/core";
import type {
  DeliveredOutput,
  DeliveryOutcome,
  JsonObject,
  PayloadTypeName,
} from "@notemap/core";
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

function delivered(
  outcome: DeliveryOutcome,
): DeliveryOutcome & { kind: "delivered" } {
  if (outcome.kind !== "delivered") {
    throw new Error(`not delivered: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/** What the destination said it wrote, read back as text. */
function outputOf(
  outcome: DeliveryOutcome,
): Promise<{ mediaType: string; text: string }> {
  return textOf(delivered(outcome).output);
}

async function textOf(
  output: DeliveredOutput | undefined,
): Promise<{ mediaType: string; text: string }> {
  const content = output?.content;
  if (content === undefined) throw new Error("it answered no content");

  const chunks: Uint8Array[] = [];
  for await (const chunk of await content.open()) chunks.push(chunk);

  return {
    mediaType: content.mediaType,
    text: chunks.map((chunk) => new TextDecoder().decode(chunk)).join(""),
  };
}

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
  it("reports an account nothing declares as unreachable, naming it", async () => {
    const server = await vault();

    const outcome = await adapter(server).deliver(
      destinationRow({ account: "not-declared", root: "" }),
      delivery(),
    );

    expect(outcome).toEqual<DeliveryOutcome>({
      kind: "unreachable",
      detail: "no webdav account named not-declared",
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

  /**
   * A missing `directory` is the root now, so only a wrong type is left for the
   * reader to catch — an extra key is the schema's business at core's boundary.
   */
  it("refuses arguments that are not a create-file argument set", async () => {
    const server = await vault();

    expect(
      await adapter(server).deliver(
        destinationRow({ root: "V" }),
        delivery({ arguments: { directory: 5 } as unknown as JsonObject }),
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

  /**
   * A gzipping proxy in front of the server is the ordinary way a strong
   * validator becomes weak, and `If-Match` compares strongly — so this would
   * otherwise report four rounds of contention that never happened.
   */
  it("names a weak ETag rather than reporting a race it did not lose", async () => {
    const server = await vault();
    server.put("V/daily.md", "the first line\n");
    server.weakenEtags();

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md" },
      }),
    );

    expect(outcome).toMatchObject({
      kind: "unreachable",
      detail: expect.stringMatching(/weak ETag/),
    });
    expect(server.requests().filter((each) => each.startsWith("PUT"))).toEqual(
      [],
    );
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

describe("creating or appending, decided here", () => {
  const send = (server: DavServer, args: Record<string, string>) =>
    adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({ capability: "create-or-append-file", arguments: args }),
    );

  it("creates the note when it is not there", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await send(server, { path: "notes/decisions.md" });

    expect(outcome).toMatchObject({ pointer: "notes/decisions.md" });
    expect(server.files()["V/notes/decisions.md"] ?? "").toContain(
      "derived_from: 'urn:commons:item:item-1'",
    );
  });

  it("appends to the note when it is already there", async () => {
    const server = await vault();
    server.put("V/decisions.md", "an earlier line\n");

    const outcome = await send(server, { path: "decisions.md" });

    expect(outcome).toMatchObject({ pointer: "decisions.md" });
    expect(server.files()["V/decisions.md"]).toContain("an earlier line");
    expect(server.files()["V/decisions.md"]).not.toContain("derived_from");
  });

  it("makes a collection that is not there", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await send(server, {
      path: "projects/notemap/drafts/a.md",
    });

    expect(outcome).toMatchObject({ pointer: "projects/notemap/drafts/a.md" });
    expect(Object.keys(server.files())).toEqual([
      "V/projects/notemap/drafts/a.md",
    ]);
  });

  it("derives the filename from a path that ends in a slash", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        capability: "create-or-append-file",
        arguments: { path: "drafts/" },
        content: { text: "# A thought\nand more of it" },
      }),
    );

    expect(outcome).toMatchObject({ pointer: "drafts/A thought.md" });
  });

  /** Without the slash there is nothing to tell a new collection from an extensionless note. */
  it("reads the same name without a slash as the note itself", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await send(server, { path: "drafts" });

    expect(outcome).toMatchObject({ pointer: "drafts" });
    expect(Object.keys(server.files())).toEqual(["V/drafts"]);
  });

  it("inserts under a heading that is already in the note", async () => {
    const server = await vault();
    server.put("V/daily.md", "# Monday\n\n## Notes\n\nthe first one\n");

    await send(server, { path: "daily.md", heading: "Notes" });

    expect(server.files()["V/daily.md"]).toContain(
      "## Notes\n\nthe first one\n\n",
    );
  });

  it("writes the heading itself when the note is new", async () => {
    const server = await vault();
    server.makeCollection("V");

    await send(server, { path: "daily.md", heading: "Notes" });

    expect(server.files()["V/daily.md"] ?? "").toContain("## Notes");
  });

  it("refuses a path that leaves the vault", async () => {
    const server = await vault();
    server.makeCollection("V");

    expect(await send(server, { path: "../escaped.md" })).toMatchObject({
      kind: "rejected",
    });
    expect(Object.keys(server.files())).toEqual([]);
  });
});

describe("assets", () => {
  const withImages = (server: DavServer) =>
    adapter(server, { [IMAGE]: renderWithAssets });

  const ONE = "a".repeat(64);
  const TWO = "b".repeat(64);

  it("land beside the note, named for the upload and for what is in them", async () => {
    const server = await vault();
    server.makeCollection("V");
    const photo = deliveredAsset("image", "photo.png", bytes("PNG"), ONE);

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
      "V/inbox/photo-aaaaaaaa.png",
    ]);
    expect(server.files()["V/inbox/photo-aaaaaaaa.png"]).toBe("PNG");
    expect(server.files()["V/inbox/a.md"]).toContain("![](photo-aaaaaaaa.png)");
  });

  it("tells two sharing one uploaded name apart by their content", async () => {
    const server = await vault();
    server.makeCollection("V");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [
          deliveredAsset("one", "photo.png", bytes("first"), ONE),
          deliveredAsset("two", "photo.png", bytes("second"), TWO),
        ],
      }),
    );

    expect(Object.keys(server.files())).toEqual([
      "V/a.md",
      "V/photo-aaaaaaaa.png",
      "V/photo-bbbbbbbb.png",
    ]);
    expect(server.files()["V/photo-bbbbbbbb.png"]).toBe("second");
  });

  it("writes beside a name the vault already had rather than over it", async () => {
    const server = await vault();
    server.put("V/photo.png", "theirs");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "photo.png", bytes("ours"), ONE)],
      }),
    );

    expect(server.files()["V/photo.png"]).toBe("theirs");
    expect(server.files()["V/photo-aaaaaaaa.png"]).toBe("ours");
  });

  /**
   * What `unreachable` promises: nothing was delivered, so a retry cannot
   * duplicate. An attempt that placed the asset and then failed leaves it under
   * the name the next attempt computes, so the next attempt lands on it.
   */
  it("lands on the copy a previous attempt already wrote", async () => {
    const server = await vault();
    server.makeCollection("V");
    server.put("V/photo-aaaaaaaa.png", "PNG");

    await withImages(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        type: IMAGE,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "photo.png", bytes("PNG"), ONE)],
      }),
    );

    expect(Object.keys(server.files())).toEqual([
      "V/a.md",
      "V/photo-aaaaaaaa.png",
    ]);
    expect(server.files()["V/a.md"]).toContain("![](photo-aaaaaaaa.png)");
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
        assets: [
          deliveredAsset("one", "../../authorized_keys", bytes("ours"), ONE),
        ],
      }),
    );

    expect(Object.keys(server.files())).toEqual([
      "V/a.md",
      "V/authorized_keys-aaaaaaaa",
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
        assets: [deliveredAsset("one", "a photo.png", bytes("PNG"), ONE)],
      }),
    );

    // Angle brackets, because a bare CommonMark destination ends at the space.
    expect(server.files()["V/a.md"]).toContain("![](<a photo-aaaaaaaa.png>)");
    expect(server.files()["V/a photo-aaaaaaaa.png"]).toBe("PNG");
  });

  it("opens no stream for a delivery carrying none", async () => {
    const server = await vault();
    server.makeCollection("V");
    const photo = deliveredAsset("image", "photo.png", bytes("PNG"), ONE);

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
        assets: [deliveredAsset("one", "photo.png", bytes("PNG"), ONE)],
      }),
    );

    expect(server.files()["V/photo-aaaaaaaa.png"]).toBe("PNG");
    expect(server.files()["V/daily.md"]).toContain("![](photo-aaaaaaaa.png)");
  });

  /** Uploaded once even where the note has to be re-read and written again. */
  it("does not upload an asset a second time when an append loses a race", async () => {
    const server = await vault();
    server.put("V/daily.md", "the first line\n");
    const photo = deliveredAsset("one", "photo.png", bytes("PNG"), ONE);

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
        assets: [
          deliveredAsset(
            "one",
            "long.wav",
            bytes("many bytes"),
            "c".repeat(64),
          ),
        ],
      }),
    );

    expect(server.arrivedChunked("V/long-cccccccc.wav")).toBe(true);
    // The note is a string the adapter already holds, so it is measured.
    expect(server.arrivedChunked("V/a.md")).toBe(false);
  });
});

describe("probing a webdav destination", () => {
  it("resolves for a folder that is there, without writing anything", async () => {
    const server = await vault();
    server.makeCollection("Notes");

    await expect(
      adapter(server).probe?.(destinationRow({ root: "Notes" })),
    ).resolves.toBeUndefined();

    expect(server.requests()).toEqual(["PROPFIND /Notes"]);
    expect(server.files()).toEqual({});
  });

  it("resolves for a blank root, which is the account's own folder", async () => {
    const server = await vault();

    await expect(
      adapter(server).probe?.(destinationRow({ root: "" })),
    ).resolves.toBeUndefined();
  });

  /** The filesystem kind says this of a root that is a file; nothing here did. */
  it("rejects a root that is a note rather than a folder", async () => {
    const server = await vault();
    server.put("a-note.md", "a thought\n");

    await expect(
      adapter(server).probe?.(destinationRow({ root: "a-note.md" })),
    ).rejects.toThrow(/is a file rather than a folder/);
  });

  it("rejects a folder that is not there, naming it", async () => {
    const server = await vault();

    await expect(
      adapter(server).probe?.(destinationRow({ root: "Nowhere" })),
    ).rejects.toThrow(/Nowhere is not there/);
  });

  it("rejects an account nothing declares, rather than calling it unreachable", async () => {
    const server = await vault();

    await expect(
      adapter(server).probe?.(
        destinationRow({ account: "not-declared", root: "" }),
      ),
    ).rejects.toThrow(Rejected);
  });

  it("rejects credentials the server would not take", async () => {
    const server = await vault();
    const kind = createWebdavDestination({
      accepts: [TEXT],
      credentials: () =>
        Promise.resolve({
          baseUrl: server.baseUrl,
          username: server.username,
          password: "the old one",
        }),
    });

    await expect(kind.probe?.(destinationRow({ root: "" }))).rejects.toThrow(
      /credentials were refused, with 401/,
    );
  });

  /** The likeliest way a wrong base URL presents, and a bare number says nothing. */
  it("says what a 405 means rather than only its number", async () => {
    const server = createServer((_request, response) =>
      response.writeHead(405).end(),
    );
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    const { port } = server.address() as AddressInfo;
    const kind = createWebdavDestination({
      accepts: [TEXT],
      credentials: () =>
        Promise.resolve({
          baseUrl: `http://127.0.0.1:${port}`,
          username: "alice",
          password: "an-app-password",
        }),
    });

    try {
      await expect(kind.probe?.(destinationRow({ root: "" }))).rejects.toThrow(
        /does not answer PROPFIND/,
      );
    } finally {
      await new Promise<void>((shut) => server.close(() => shut()));
    }
  });

  it("is unreachable, not rejected, where nothing answered at all", async () => {
    const server = await vault();
    const gone = server.baseUrl;
    await server.close();
    servers.splice(servers.indexOf(server), 1);

    const kind = createWebdavDestination({
      accepts: [TEXT],
      credentials: () =>
        Promise.resolve({
          baseUrl: gone,
          username: "alice",
          password: "an-app-password",
        }),
    });

    const failed = await kind
      .probe?.(destinationRow({ root: "" }))
      .catch((cause: unknown) => cause);

    expect(failed).toBeInstanceOf(Error);
    expect(failed).not.toBeInstanceOf(Rejected);
  });
});

describe("what it says it wrote", () => {
  it("answers the whole note it created, and nothing to confess", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({ arguments: { directory: "", filename: "note.md" } }),
    );

    expect(await outputOf(outcome)).toEqual({
      mediaType: "text/markdown",
      text: server.files()["V/note.md"],
    });
    expect(delivered(outcome).output?.note).toBeUndefined();
    // The address is the daemon's credential, not a link anyone else follows.
    expect(delivered(outcome).url).toBeUndefined();
  });

  it("answers what an append inserted, not the note it was inserted into", async () => {
    const server = await vault();
    server.put("V/daily.md", "# Monday\n\nyesterday\n");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md" },
      }),
    );

    const said = (await outputOf(outcome)).text;
    expect(said).toContain('"text": "a thought"');
    expect(said).not.toContain("yesterday");
    expect(server.files()["V/daily.md"]).toContain("yesterday");
  });

  it("answers the whole note where the append brought one into being", async () => {
    const server = await vault();
    server.makeCollection("V");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md" },
      }),
    );

    expect((await outputOf(outcome)).text).toBe(server.files()["V/daily.md"]);
  });
});

describe("what it says it would write", () => {
  const preview = (server: DavServer, each = delivery()) =>
    adapter(server).preview?.(destinationRow({ root: "V" }), each) ??
    Promise.reject(new Error("the kind offers no preview"));

  it("answers the note a create would land, and writes nothing", async () => {
    const server = await vault();
    server.makeCollection("V");
    const each = delivery({
      arguments: { directory: "", filename: "note.md" },
      tags: ["project/fiction-a"],
    });

    const shown = await textOf(await preview(server, each));

    expect(shown.mediaType).toBe("text/markdown");
    expect(shown.text).toContain("- 'project/fiction-a'");
    expect(server.files()).toEqual({});
    // Its own `PUT` is conditional, so a delivery never asks first and neither
    // does this: nothing was read either.
    expect(server.requests()).toEqual([]);

    expect(
      (
        await outputOf(
          await adapter(server).deliver(destinationRow({ root: "V" }), each),
        )
      ).text,
    ).toBe(shown.text);
  });

  it("reads the note an append would go into, and leaves it as it was", async () => {
    const server = await vault();
    server.put("V/daily.md", "# Monday\n\nyesterday\n");
    const each = delivery({
      capability: "append-to-file",
      arguments: { path: "daily.md" },
    });

    const shown = await textOf(await preview(server, each));

    expect(shown.text).not.toContain("yesterday");
    expect(server.files()["V/daily.md"]).toBe("# Monday\n\nyesterday\n");
    expect(server.requests().every((each) => each.startsWith("GET"))).toBe(
      true,
    );

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      each,
    );
    expect((await outputOf(outcome)).text).toBe(shown.text);
  });

  it("shows the whole note where the append would bring one into being", async () => {
    const server = await vault();
    server.makeCollection("V");

    const shown = await textOf(
      await preview(
        server,
        delivery({
          capability: "append-to-file",
          arguments: { path: "daily.md" },
        }),
      ),
    );

    expect(shown.text).toContain("derived_from: 'urn:commons:item:item-1'");
    expect(server.files()).toEqual({});
  });

  it("uploads no assets, and links them by the names they would land under", async () => {
    const server = await vault();
    server.makeCollection("V");
    const picture = deliveredAsset("image", "photo.png", bytes("PNG"));

    const shown = await textOf(
      await preview(
        server,
        delivery({
          arguments: { directory: "", filename: "note.md" },
          assets: [picture],
        }),
      ),
    );

    expect(shown.text).toContain("photo");
    expect(server.files()).toEqual({});
    // A name is arithmetic on the asset, so nothing had to be read to say it.
    expect(picture.opens()).toBe(0);
  });

  it("refuses a path that leaves the vault, as a delivery would", async () => {
    const server = await vault();
    server.makeCollection("V");

    await expect(
      preview(
        server,
        delivery({ arguments: { directory: "../..", filename: "note.md" } }),
      ),
    ).rejects.toThrow(Rejected);
  });
});
