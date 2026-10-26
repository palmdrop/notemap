import { afterEach, describe, expect, it } from "vitest";

import { createWebdavDestination } from "./destination";
import { delivery, destinationRow, resolverFor, TEXT } from "./testing/fixture";
import { startDavServer, type DavServer } from "./testing/dav-server";

const servers: DavServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** A vault holding a folder named exactly where a note is about to go. */
async function vault(serving: "not-found" | "a-listing") {
  const server = await startDavServer();
  servers.push(server);
  server.makeCollection("V");
  server.makeCollection("V/ideas");
  if (serving === "a-listing") server.listCollections();

  const kind = createWebdavDestination({
    accepts: [TEXT],
    credentials: resolverFor(server),
  });
  return {
    server,
    deliver: (capability: string, args: Record<string, string>) =>
      kind.deliver(
        destinationRow({ root: "V" }),
        delivery({ capability, arguments: args }),
      ),
  };
}

describe("routing onto a path that is a folder", () => {
  for (const serving of ["not-found", "a-listing"] as const) {
    describe(`where a GET on a folder answers ${serving}`, () => {
      it("refuses an append, saying it is a folder", async () => {
        const { server, deliver } = await vault(serving);

        expect(await deliver("append", { path: "ideas" })).toEqual({
          kind: "rejected",
          detail: "ideas is a folder, not a note",
        });
        expect(server.files()).toEqual({});
      });

      it("refuses create-or-append, saying it is a folder", async () => {
        const { deliver } = await vault(serving);

        expect(
          await deliver("create-or-append", { path: "ideas" }),
        ).toMatchObject({
          kind: "rejected",
          detail: "ideas is a folder, not a note",
        });
      });

      it("refuses a create, saying it is a folder", async () => {
        const { deliver } = await vault(serving);

        expect(
          await deliver("create", { directory: "", filename: "ideas" }),
        ).toMatchObject({
          kind: "rejected",
          detail: "ideas is a folder, not a note",
        });
      });
    });
  }
});
