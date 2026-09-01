import { request as httpRequest } from "node:http";

import { describe, expect, it } from "vitest";

import {
  browser,
  daemons,
  IMAGE_SOURCE,
  MANUAL,
  NAME,
  PASSWORD,
  read,
  setPassword,
  until,
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

const CREDENTIAL = JSON.stringify({ name: NAME, password: PASSWORD });

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Slice = { values: { id: string; tags: { name: string }[] }[] };

/** A signed-in cookie, for reading the pool over `fetch` rather than the client. */
async function cookieFor(url: string): Promise<string> {
  const said = (await signIn(url)).headers.get("set-cookie") ?? "";
  return said.split(";")[0] ?? "";
}

const signIn = (url: string) =>
  fetch(`${url}/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: CREDENTIAL,
  });

/**
 * `fetch` writes the `Host` header itself and will not be talked out of it, and
 * a host the daemon was not bound to is the whole of what these ask about — so
 * this one goes over `node:http`, where the header is the caller's to set.
 */
function signInAs(url: string, host: string): Promise<number> {
  const target = new URL(`${url}/v1/session`);

  return new Promise((resolve, reject) => {
    const call = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: {
          host,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(CREDENTIAL),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );

    call.on("error", reject);
    call.end(CREDENTIAL);
  });
}

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

describe("a daemon told its password by the environment", () => {
  /**
   * The variable is read before anything listens, so there is no moment where
   * a daemon meant to have a door answers a request without one.
   */
  it("arrives with the door already shut", async () => {
    const running = await daemon(undefined, { NOTEMAP_PASSWORD: PASSWORD });

    expect((await fetch(`${running.url}/v1/feed`)).status).toBe(401);
    expect((await signIn(running.url)).status).toBe(200);
    expect(running.output()).toContain("NOTEMAP_PASSWORD");
  });

  /** A restart must not undo a password somebody changed. */
  it("leaves the one already set alone", async () => {
    const on = world({});
    await setPassword(on, "a password of their own choosing");

    const running = await daemon(on, { NOTEMAP_PASSWORD: PASSWORD });

    expect((await signIn(running.url)).status).toBe(401);
    expect(
      (
        await fetch(`${running.url}/v1/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: NAME,
            password: "a password of their own choosing",
          }),
        })
      ).status,
    ).toBe(200);
  });

  it("does not start at all where the password is one nobody may have", async () => {
    await expect(
      daemon(undefined, { NOTEMAP_PASSWORD: "too short" }),
    ).rejects.toThrow(/shorter than 12 characters/);
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

/**
 * The daemon's own wiring, which is the half a unit test cannot reach: `main.ts`
 * decides the cookie from the config file and hands the same origin to the
 * notice, and a tunnel is exactly the case where the bind address is no answer.
 */
/**
 * The outbox parks on a shut door rather than refusing, which is tested over a
 * mock transport — and every full-stack proof of it replaying runs against a
 * daemon with no password. This is the two together: a real door, a real
 * transport, and everything queued behind it.
 */
describe("an outbox that filled up against a shut door", () => {
  it("lands everything once when the door opens, bytes and order included", async () => {
    const running = await shut();
    const client = browser(running.url);

    const asset = await client.attach(
      new File([BYTES], "whiteboard.png", { type: "image/png" }),
    );
    const first = await client.capture({
      channel: IMAGE_SOURCE,
      text: "written while nobody was signed in",
      asset,
    });
    const second = await client.capture({
      channel: MANUAL,
      text: "and one after it",
    });
    await client.tag(first.id, "meeting");

    // A shut door is not a refusal: nothing is dropped, and nothing is applied
    // twice by the drain that met it.
    await client.drain();
    expect(read(client.outbox)).toHaveLength(3);

    await client.login(NAME, PASSWORD);
    await until("the outbox to empty", async () => {
      await client.drain();
      return read(client.outbox).length === 0 ? true : undefined;
    });

    // Read outside the client, so what the pool holds is what is asserted on
    // rather than what the client believes it sent.
    const cookie = await cookieFor(running.url);
    const feed = (await (
      await fetch(`${running.url}/v1/feed`, { headers: { cookie } })
    ).json()) as Slice;

    expect(feed.values.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(feed.values[1]?.tags.map((tag) => tag.name)).toEqual(["meeting"]);

    const served = await fetch(client.assetContent(asset), {
      headers: { cookie },
    });
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(BYTES);
  });
});

describe("a daemon reached somewhere it was not told about", () => {
  const noticed = (running: Running) =>
    until(
      "the daemon to notice where it was reached",
      async () => running.output().includes("daemon.origin") || undefined,
    );

  const notices = (running: Running) =>
    running.output().match(/a sign-in arrived/g)?.length ?? 0;

  it("says which key would fix it, on a daemon that configured none", async () => {
    const running = await shut();

    expect(await signInAs(running.url, "notemap.internal")).toBe(200);

    await noticed(running);
    expect(running.output()).toContain("notemap.internal");
  });

  /**
   * Behind a positive fence, because the notice is said once: a loopback
   * sign-in that said nothing is what leaves the one below free to be the first.
   */
  it("says nothing where a browser reached it on loopback", async () => {
    const running = await shut();

    await signIn(running.url);
    await signInAs(running.url, "notemap.internal");

    await noticed(running);
    expect(notices(running)).toBe(1);
    expect(running.output()).toContain("notemap.internal");
  });

  it("says nothing where the origin it was told matches", async () => {
    const running = await shut({ origin: "http://notemap.internal:4747" });

    await signInAs(running.url, "notemap.internal");
    await signInAs(running.url, "elsewhere.internal");

    await noticed(running);
    expect(notices(running)).toBe(1);
    expect(running.output()).toContain("elsewhere.internal");
  });
});
