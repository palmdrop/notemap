import {
  NotOffered,
  type CandidatesRequest,
  type CapabilityName,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createWebdavDestination } from "./destination";
import { startDavServer, type DavServer } from "./testing/dav-server";
import { destinationRow, resolverFor, TEXT } from "./testing/fixture";

const servers: DavServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** The kind's `candidates`, bound to one destination row, over a real fake server. */
async function vault(root = "V") {
  const server = await startDavServer();
  servers.push(server);
  server.makeCollection("V");

  const kind = createWebdavDestination({
    accepts: [TEXT],
    credentials: resolverFor(server),
  });
  if (kind.candidates === undefined) {
    throw new Error("the webdav kind is expected to offer candidates");
  }
  const method = kind.candidates;
  const row = destinationRow({ root });

  return {
    server,
    candidates: (request: CandidatesRequest) => method(row, request),
  };
}

const LINE: CandidatesRequest = {
  capability: "create-or-append" as CapabilityName,
  field: "path",
};

const DIRECTORY: CandidatesRequest = {
  capability: "create" as CapabilityName,
  field: "directory",
};

describe("what a webdav vault offers the typed line", () => {
  it("answers collections and notes together, collections first", async () => {
    const { server, candidates } = await vault();
    server.makeCollection("V/projects");
    server.put("V/decisions.md", "a note");

    expect((await candidates(LINE)).entries).toEqual([
      { label: "projects", scope: "projects" },
      { label: "decisions.md", value: "decisions.md" },
    ]);
  });

  it("descends a scope, naming everything from the destination's root", async () => {
    const { server, candidates } = await vault();
    server.makeCollection("V/projects");
    server.makeCollection("V/projects/notemap");
    server.put("V/projects/a.md", "a note");

    expect((await candidates({ ...LINE, scope: "projects" })).entries).toEqual([
      { label: "notemap", scope: "projects/notemap" },
      { label: "a.md", value: "projects/a.md" },
    ]);
  });

  /** One level, so a vault of any depth costs one round trip per level typed. */
  it("names nothing below the level it was asked about", async () => {
    const { server, candidates } = await vault();
    server.makeCollection("V/projects");
    server.put("V/projects/buried.md", "a note");

    expect((await candidates(LINE)).entries).toEqual([
      { label: "projects", scope: "projects" },
    ]);
  });

  it("reads a name the href had to encode", async () => {
    const { server, candidates } = await vault();
    server.put("V/a note & more.md", "a note");

    expect((await candidates(LINE)).entries).toEqual([
      { label: "a note & more.md", value: "a note & more.md" },
    ]);
  });

  it("hides the dotfiles, as the filesystem kind does", async () => {
    const { server, candidates } = await vault();
    server.put("V/.hidden.md", "a note");
    server.put("V/shown.md", "a note");

    expect((await candidates(LINE)).entries).toEqual([
      { label: "shown.md", value: "shown.md" },
    ]);
  });

  /** A folder still being typed, which is an ordinary state of a path. */
  it("answers nothing for a collection that is not there", async () => {
    const { candidates } = await vault();

    expect((await candidates({ ...LINE, scope: "nope" })).entries).toEqual([]);
  });

  it("offers create's directory the collections alone", async () => {
    const { server, candidates } = await vault();
    server.makeCollection("V/projects");
    server.put("V/decisions.md", "a note");

    expect((await candidates(DIRECTORY)).entries).toEqual([
      { label: "projects", value: "projects", scope: "projects" },
    ]);
  });

  it("offers nothing for a heading, which is free text", async () => {
    const { candidates } = await vault();

    await expect(candidates({ ...LINE, field: "heading" })).rejects.toThrow(
      NotOffered,
    );
  });

  it("refuses a scope that leaves the destination", async () => {
    const { candidates } = await vault();

    await expect(candidates({ ...LINE, scope: "../.." })).rejects.toThrow();
  });

  /** The account's own collection, which a blank root names. */
  it("browses a root that is the account itself", async () => {
    const { server, candidates } = await vault("");
    server.put("loose.md", "a note");

    expect((await candidates(LINE)).entries).toContainEqual({
      label: "loose.md",
      value: "loose.md",
    });
  });
});
