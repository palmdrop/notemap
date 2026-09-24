import type { Client } from "@notemap/client";
import { describe, expect, it } from "vitest";

import {
  browser,
  daemons,
  davServers,
  MANUAL,
  mintToken,
  NAME,
  PASSWORD,
  shutWorld,
  until,
  type DavServer,
} from "./harness/index.ts";

const daemon = daemons();
const dav = davServers();

const ACCOUNT = "cloud";

/** A config account at the right address that can never present a password. */
const unreadable = (server: DavServer) => `
[[accounts]]
kind = "webdav"
name = "${ACCOUNT}"
baseUrl = "${server.baseUrl}"
username = "${server.username}"
passwordEnv = "NOTEMAP_FULL_STACK_NEVER_SET"
`;

async function signedIn(url: string): Promise<Client> {
  const client = browser(url);
  await client.login(NAME, PASSWORD);
  return client;
}

const store = (client: Client, server: DavServer) =>
  client.accounts.put("webdav", ACCOUNT, {
    fields: { baseUrl: server.baseUrl, username: server.username },
    secret: server.password,
  });

/** Captures one thing and routes it to a new webdav destination naming the account. */
async function routeOne(client: Client, filename: string): Promise<void> {
  const destination = await client.destinations.create({
    name: "Cloud",
    kind: "webdav",
    settings: { account: ACCOUNT, root: "" },
  });
  const captured = await client.capture({
    channel: MANUAL,
    text: "out to somebody else's server",
  });
  await client.drain();

  await client.routing.route(captured.id, {
    destination: destination.id,
    capability: "create",
    arguments: { directory: "inbox", filename },
  });
}

const landed = (server: DavServer, filename: string) => async () =>
  Object.keys(server.files()).find((path) => path.endsWith(filename));

describe("an account set over the routes", () => {
  it("is used by a real delivery, with no restart", async () => {
    const server = await dav();
    const running = await daemon(await shutWorld());
    const client = await signedIn(running.url);

    await store(client, server);
    await routeOne(client, "stored.md");

    await until(
      "the DAV server to hold the delivery",
      landed(server, "stored.md"),
    );
  });

  it("replaces a config account of the same kind and name entirely", async () => {
    const server = await dav();
    const running = await daemon(
      await shutWorld({ accounts: unreadable(server) }),
    );
    const client = await signedIn(running.url);

    await store(client, server);
    await routeOne(client, "shadowing.md");

    await until(
      "the DAV server to hold the delivery",
      landed(server, "shadowing.md"),
    );
    expect(
      (await client.accounts.list()).map((each) => [each.from, each.shadowed]),
    ).toEqual([
      ["stored", false],
      ["config", true],
    ]);
  });

  it("reveals the config account again once removed", async () => {
    const server = await dav();
    const running = await daemon(
      await shutWorld({ accounts: unreadable(server) }),
    );
    const client = await signedIn(running.url);
    await store(client, server);

    const removed = await client.accounts.remove("webdav", ACCOUNT);

    expect(removed.revealed).toMatchObject({ from: "config", shadowed: false });
    expect(await client.accounts.list()).toEqual([
      expect.objectContaining({ from: "config", shadowed: false }),
    ]);
  });
});

describe("the account routes, by who is asking", () => {
  it("refuse a bearer token where a session is answered", async () => {
    const server = await dav();
    const on = await shutWorld();
    const token = await mintToken(on);
    const running = await daemon(on);
    const client = await signedIn(running.url);
    await store(client, server);

    const bearer = { authorization: `Bearer ${token}` };
    for (const [method, path] of [
      ["GET", "/v1/account-kinds"],
      ["GET", "/v1/accounts"],
      ["PUT", `/v1/accounts/webdav/${ACCOUNT}`],
      ["DELETE", `/v1/accounts/webdav/${ACCOUNT}`],
    ] as const) {
      const refused = await fetch(`${running.url}${path}`, {
        method,
        headers: { ...bearer, "content-type": "application/json" },
        ...(method === "PUT"
          ? { body: JSON.stringify({ fields: {}, secret: "no" }) }
          : {}),
      });

      expect(refused.status, path).toBe(403);
      expect((await refused.json()).error.code, path).toBe("session-required");
    }

    const listed = await client.accounts.list();
    expect(listed.map((each) => each.name)).toEqual([ACCOUNT]);
    expect(JSON.stringify(listed)).not.toContain(server.password);
  });
});
