import { describe, expect, it } from "vitest";

import {
  browser,
  daemons,
  MANUAL,
  NAME,
  PASSWORD,
  read,
  setPassword,
  world,
  type Running,
  type Told,
} from "./harness/index.ts";

const daemon = daemons();

/** A daemon whose credential was set before it started, which shuts the door. */
async function shut(told: Told = {}): Promise<Running> {
  const on = world(told);
  await setPassword(on);
  return daemon(on);
}

const signIn = (url: string) =>
  fetch(`${url}/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: NAME, password: PASSWORD }),
  });

async function setCookieFrom(running: Running): Promise<string> {
  const response = await signIn(running.url);

  expect(response.status).toBe(200);
  const said = response.headers.get("set-cookie");
  expect(said).not.toBeNull();

  return said as string;
}

/**
 * The attributes are asserted on the wire rather than through the jar, because
 * the browser is the thing that judges them and nothing here can be it: a
 * prefix Chromium rejects is a cookie a suite with its own jar keeps happily,
 * and every request after the sign-in is a `401` only in the real browser.
 */
describe("the cookie a daemon hands a browser", () => {
  it("is named plainly on the loopback daemon nobody configured", async () => {
    const said = await setCookieFrom(await shut());

    expect(said).toMatch(/^session=/);
    expect(said).not.toContain("__Host-");
  });

  it("is named plainly behind a plain-HTTP origin as well", async () => {
    const said = await setCookieFrom(
      await shut({ origin: "http://notes.example.com" }),
    );

    expect(said).toMatch(/^session=/);
  });

  it("takes the __Host- prefix once an origin says https", async () => {
    const said = await setCookieFrom(
      await shut({ origin: "https://notes.example.com" }),
    );

    expect(said).toMatch(/^__Host-session=/);
  });

  it("keeps Secure on loopback, which a browser trusts whatever the scheme", async () => {
    expect(await setCookieFrom(await shut())).toContain("Secure");
  });

  it("gives Secure up where plain HTTP crosses a network", async () => {
    const said = await setCookieFrom(
      await shut({ origin: "http://notes.example.com" }),
    );

    expect(said).not.toContain("Secure");
  });

  it("is unreadable to script, scoped to the root, and bound to no domain", async () => {
    const said = await setCookieFrom(await shut());

    expect(said).toContain("HttpOnly");
    expect(said).toContain("Path=/");
    expect(said).toContain("SameSite=Lax");
    expect(said).not.toContain("Domain=");
  });
});

describe("a client against a daemon with a password set", () => {
  it("is turned away from the pool until it signs in", async () => {
    const running = await shut();
    const client = browser(running.url);

    await expect(client.loadFeed()).resolves.toBeUndefined();
    expect(read(client.feed).failure).toBeDefined();
  });

  it("says the door is shut and that nobody is through it", async () => {
    const running = await shut();

    const held = await browser(running.url).askSession();

    expect(held).toMatchObject({
      required: true,
      signedIn: false,
      known: true,
    });
  });

  /** The whole round trip: the cookie is minted, kept, sent back, and taken. */
  it("reads the pool with the cookie the sign-in gave it", async () => {
    const running = await shut();
    const client = browser(running.url);

    await client.login(NAME, PASSWORD);
    await client.capture({ channel: MANUAL, text: "through the door" });
    await client.drain();
    await client.loadFeed();

    const feed = read(client.feed);
    expect(feed.failure).toBeUndefined();
    expect(feed.items.map((item) => client.says(item))).toEqual([
      "through the door",
    ]);
  });

  it("is turned away again once it signs out", async () => {
    const running = await shut();
    const client = browser(running.url);

    await client.login(NAME, PASSWORD);
    await client.logout();

    expect(await client.askSession()).toMatchObject({ signedIn: false });
    await client.loadFeed();
    expect(read(client.feed).failure).toBeDefined();
  });

  it("carries a wrong password nowhere", async () => {
    const running = await shut();
    const client = browser(running.url);

    await expect(client.login(NAME, "not it")).rejects.toThrow();
    expect(read(client.session).signedIn).toBe(false);
  });
});

describe("a client against a daemon nobody has set a password on", () => {
  it("reads the pool without signing in, and is told there is nothing to sign into", async () => {
    const running = await daemon();
    const client = browser(running.url);

    const held = await client.askSession();
    await client.loadFeed();

    expect(held).toMatchObject({ required: false, signedIn: false });
    expect(read(client.feed).failure).toBeUndefined();
  });
});
