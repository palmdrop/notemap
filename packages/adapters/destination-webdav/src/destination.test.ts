import type { DeliveryOutcome } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createWebdavDestination } from "./destination";
import { delivery, destinationRow, resolverFor, TEXT } from "./testing/fixture";
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

function adapter(server: DavServer) {
  return createWebdavDestination({
    accepts: [TEXT],
    credentials: resolverFor(server),
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

  it("lands beside a name that is taken rather than over it", async () => {
    const server = await vault();
    server.put("V/note.md", "somebody else's note");

    const outcome = await adapter(server).deliver(
      destinationRow({ root: "V" }),
      delivery({ arguments: { directory: "", filename: "note.md" } }),
    );

    expect(outcome).toMatchObject({ pointer: "note-1.md" });
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

  it("produces two notes where two creates race, and never one", async () => {
    const server = await vault();
    server.makeCollection("V");

    const create = () =>
      adapter(server).deliver(
        destinationRow({ root: "V" }),
        delivery({ arguments: { directory: "", filename: "note.md" } }),
      );

    const outcomes = await Promise.all([create(), create(), create()]);

    expect(outcomes.map((each) => each.kind)).toEqual([
      "delivered",
      "delivered",
      "delivered",
    ]);
    expect(Object.keys(server.files()).sort()).toEqual([
      "V/note-1.md",
      "V/note-2.md",
      "V/note.md",
    ]);
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
