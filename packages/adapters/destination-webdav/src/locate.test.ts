import type { CapabilityName, LocateRequest } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createWebdavDestination } from "./destination";
import { destinationRow, resolverFor, TEXT } from "./testing/fixture";
import { startDavServer, type DavServer } from "./testing/dav-server";

const servers: DavServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function vault() {
  const server = await startDavServer();
  servers.push(server);
  const kind = createWebdavDestination({
    accepts: [TEXT],
    credentials: resolverFor(server),
  });
  const row = destinationRow({ root: "Notes" });
  server.makeCollection("Notes");

  return {
    server,
    locate: (request: Partial<LocateRequest>) => {
      if (kind.locate === undefined)
        throw new Error("the kind looks for nothing");
      return kind.locate(row, {
        capability: "create" as CapabilityName,
        arguments: {},
        ...request,
      });
    },
  };
}

describe("looking for what a record points at", () => {
  it("finds a note that is there, writing nothing", async () => {
    const { server, locate } = await vault();
    server.put("Notes/inbox/a-thought.md", "a thought\n");
    const before = server.files();

    expect(await locate({ pointer: "inbox/a-thought.md" })).toEqual({
      kind: "present",
      found: 1,
      of: 1,
    });
    expect(server.files()).toEqual(before);
  });

  it("answers absent for a note that is gone", async () => {
    const { locate } = await vault();

    expect(await locate({ pointer: "inbox/a-thought.md" })).toEqual({
      kind: "absent",
    });
  });

  it("cannot tell for a folder", async () => {
    const { server, locate } = await vault();
    server.makeCollection("Notes/pictures");

    expect(await locate({ pointer: "pictures" })).toMatchObject({
      kind: "unknown",
    });
  });

  it("cannot tell for a record with no pointer, and asks nothing", async () => {
    const { server, locate } = await vault();

    expect(await locate({})).toEqual({ kind: "unknown" });
    expect(server.requests()).toEqual([]);
  });

  it("never looks outside the root", async () => {
    const { locate } = await vault();

    expect(await locate({ pointer: "../../secret.md" })).toMatchObject({
      kind: "unknown",
    });
  });
});
