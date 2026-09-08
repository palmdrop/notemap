import { readdir } from "node:fs/promises";

import {
  createClient,
  createFetchTransport,
  createMemoryStore,
} from "@notemap/client";
import { describe, expect, it } from "vitest";

import {
  browser,
  daemons,
  MANUAL,
  mintToken,
  NAME,
  PASSWORD,
  shutWorld,
  until,
  vaults,
} from "./harness/index.ts";

const daemon = daemons();

async function delivered(root: string): Promise<string | undefined> {
  const entries = await readdir(root, { recursive: true }).catch(() => []);
  return entries.find((name) => name.endsWith(".md"));
}

describe("the whole path with the door shut", () => {
  it("refuses a request carrying nothing at all", async () => {
    const running = await daemon(await shutWorld());

    expect((await fetch(`${running.url}/v1/feed`)).status).toBe(401);
    expect(
      (
        await fetch(`${running.url}/v1/captures`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel: MANUAL, text: "no" }),
        })
      ).status,
    ).toBe(401);
  });

  it("signs in, captures and routes, on the cookie the sign-in gave it", async () => {
    const running = await daemon(await shutWorld());
    const client = browser(running.url);

    await client.login(NAME, PASSWORD);

    const vault = await vaults(running, client);
    const captured = await client.capture({
      channel: MANUAL,
      text: "through the door and out the other side",
    });
    await client.drain();

    await client.routing.route(captured.id, {
      destination: vault.up,
      capability: "create",
      arguments: { directory: "inbox", filename: "a-thought.md" },
    });

    await until("the vault to hold the delivery", () =>
      delivered(running.world.up),
    );
  });
});

/**
 * What the tokens are for, and the first proof of it: no browser, no cookie,
 * no sign-in — a credential a script was handed, carried in a header.
 */
describe("a client carrying an access token", () => {
  const headless = (url: string, token: string) =>
    createClient({
      transport: createFetchTransport(url, { token }),
      store: createMemoryStore(),
    });

  it("captures and routes without ever signing in", async () => {
    const on = await shutWorld();
    const token = await mintToken(on, "the outbox on my phone");
    const running = await daemon(on);
    const client = headless(running.url, token);

    const vault = await vaults(running, client);
    const captured = await client.capture({
      channel: MANUAL,
      text: "sent by something with no browser in it",
    });
    await client.drain();

    await client.routing.route(captured.id, {
      destination: vault.up,
      capability: "create",
      arguments: { directory: "inbox", filename: "from-a-script.md" },
    });

    await until("the vault to hold the delivery", () =>
      delivered(running.world.up),
    );
  });

  it("says it is a token rather than a session, and names itself", async () => {
    const on = await shutWorld();
    const token = await mintToken(on, "the outbox on my phone");
    const running = await daemon(on);

    expect(await headless(running.url, token).askSession()).toMatchObject({
      required: true,
      signedIn: true,
      as: { kind: "token", name: "the outbox on my phone" },
    });
  });

  /** The containment rule, end to end: a leaked token cannot mint its replacement. */
  it("cannot reach the routes that manage tokens, or end every session", async () => {
    const on = await shutWorld();
    const token = await mintToken(on);
    const running = await daemon(on);
    const carrying = { authorization: `Bearer ${token}` };

    for (const [method, path] of [
      ["GET", "/v1/tokens"],
      ["POST", "/v1/tokens"],
      ["DELETE", "/v1/sessions"],
    ] as const) {
      const refused = await fetch(`${running.url}${path}`, {
        method,
        headers: { ...carrying, "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ name: "no" }) } : {}),
      });

      expect(refused.status, path).toBe(403);
      expect((await refused.json()).error.code, path).toBe("session-required");
    }

    // And the pool itself is open to it, which is what makes that a rule
    // rather than the token simply not working.
    expect(
      (await fetch(`${running.url}/v1/feed`, { headers: carrying })).status,
    ).toBe(200);
  });

  it("stops working the moment it is revoked", async () => {
    const on = await shutWorld();
    const token = await mintToken(on);
    const running = await daemon(on);
    const carrying = { authorization: `Bearer ${token}` };

    expect(
      (await fetch(`${running.url}/v1/feed`, { headers: carrying })).status,
    ).toBe(200);

    const client = browser(running.url);
    await client.login(NAME, PASSWORD);
    const listed = (await (
      await fetch(`${running.url}/v1/tokens`, {
        headers: { cookie: await cookieFor(running.url) },
      })
    ).json()) as { values: { id: string }[] };

    await fetch(`${running.url}/v1/tokens/${listed.values[0]?.id ?? ""}`, {
      method: "DELETE",
      headers: { cookie: await cookieFor(running.url) },
    });

    expect(
      (await fetch(`${running.url}/v1/feed`, { headers: carrying })).status,
    ).toBe(401);
  });
});

async function cookieFor(url: string): Promise<string> {
  const said = await fetch(`${url}/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: NAME, password: PASSWORD }),
  });

  return (said.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}
