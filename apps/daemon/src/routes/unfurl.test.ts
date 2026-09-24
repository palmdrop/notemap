import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PoolSettingName, Timestamp } from "@notemap/core";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import { daemon, type Daemon } from "../testing/fixture";
import { createUnfurler } from "../unfurl";
import {
  FAILED_UNFURL_LIFETIME_MS,
  MAX_REDIRECTS,
  UNFURL_LIFETIME_MS,
  UNFURL_TIMEOUT_MS,
} from "../unfurl/limits";
import type { Address, Fetched, PinnedFetch } from "../unfurl/types";

const PUBLIC: Address = { address: "93.184.215.14", family: 4 };

type Page = Fetched | (() => Promise<Fetched>);

/** A small internet: names answer addresses, and URLs answer pages. */
function web(
  names: Record<string, readonly Address[] | (() => readonly Address[])>,
  pages: Record<string, Page>,
) {
  let clock = 0;
  const resolve = vi.fn(async (hostname: string) => {
    const answer = names[hostname];
    if (answer === undefined) throw new Error(`ENOTFOUND ${hostname}`);
    return typeof answer === "function" ? answer() : answer;
  });
  const fetch = vi.fn<PinnedFetch>(async (url) => {
    const page = pages[url.href];
    if (page === undefined) return { status: 404 };
    return typeof page === "function" ? page() : page;
  });
  const unfurler = createUnfurler({ resolve, fetch, now: () => clock });
  return {
    resolve,
    fetch,
    unfurler,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** A fresh body per fetch: a stream is read once. */
const html =
  (body: string): (() => Promise<Fetched>) =>
  async () => ({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: Readable.from([Buffer.from(body)]),
  });

const redirect = (location: string): Fetched => ({
  status: 302,
  location,
});

const open: Daemon[] = [];
const directories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function serving(unfurler: ReturnType<typeof web>["unfurler"]): Daemon {
  const host = daemon(undefined, { unfurler });
  open.push(host);
  return host;
}

const body = (response: Response) => response.json() as Promise<never>;

async function ask(host: Daemon, url: string): Promise<Response> {
  return host.app.request(`/v1/unfurl?url=${encodeURIComponent(url)}`);
}

describe("GET /v1/unfurl", () => {
  it("answers a page's four Open Graph properties", async () => {
    const { unfurler } = web(
      { "example.org": [PUBLIC] },
      {
        "https://example.org/a": html(`
          <meta property="og:title" content="A">
          <meta property="og:description" content="About A">
          <meta property="og:image" content="/a.png">
          <meta property="og:site_name" content="Example">`),
      },
    );
    const host = serving(unfurler);

    const response = await ask(host, "https://example.org/a");

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      url: "https://example.org/a",
      reached: true,
      title: "A",
      description: "About A",
      image: "https://example.org/a.png",
      siteName: "Example",
    });
  });

  it("falls back to the document's title", async () => {
    const { unfurler } = web(
      { "example.org": [PUBLIC] },
      { "https://example.org/": html("<title>Plain</title>") },
    );

    expect(
      await body(await ask(serving(unfurler), "https://example.org/")),
    ).toEqual({ url: "https://example.org/", reached: true, title: "Plain" });
  });

  it("answers a page that says nothing about itself, as reached", async () => {
    const { unfurler } = web(
      { "example.org": [PUBLIC] },
      { "https://example.org/": html("<p>hi</p>") },
    );

    expect(
      await body(await ask(serving(unfurler), "https://example.org/")),
    ).toEqual({ url: "https://example.org/", reached: true });
  });

  it("answers an image by its own address", async () => {
    const { unfurler } = web(
      { "example.org": [PUBLIC] },
      {
        "https://example.org/a.jpg": {
          status: 200,
          contentType: "image/jpeg",
        },
      },
    );

    expect(
      await body(await ask(serving(unfurler), "https://example.org/a.jpg")),
    ).toEqual({
      url: "https://example.org/a.jpg",
      reached: true,
      image: "https://example.org/a.jpg",
    });
  });

  it("reads nothing of a body that is not a page", async () => {
    let pulled = 0;
    const body = Readable.from(
      (function* () {
        for (let chunk = 0; chunk < 64; chunk++) {
          pulled += 1;
          yield Buffer.alloc(16 * 1024);
        }
      })(),
    );
    const { unfurler } = web(
      { "example.org": [PUBLIC] },
      {
        "https://example.org/a.jpg": {
          status: 200,
          contentType: "image/jpeg",
          body,
        },
      },
    );

    await ask(serving(unfurler), "https://example.org/a.jpg");

    expect(pulled).toBe(0);
    expect(body.destroyed).toBe(true);
  });

  it("answers a target that could not be read as unreached, not refused", async () => {
    const { unfurler } = web({ "example.org": [PUBLIC] }, {});

    const missing = await ask(serving(unfurler), "https://example.org/gone");
    expect(missing.status).toBe(200);
    expect(await body(missing)).toEqual({
      url: "https://example.org/gone",
      reached: false,
    });
  });

  it("answers a name that does not resolve as unreached", async () => {
    const { unfurler } = web({}, {});

    expect(
      await body(await ask(serving(unfurler), "https://nowhere.example/")),
    ).toEqual({ url: "https://nowhere.example/", reached: false });
  });

  it("follows a redirect chain inside the cap, checking each hop", async () => {
    const pages: Record<string, Page> = {};
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      pages[`https://example.org/${hop}`] = redirect(`/${hop + 1}`);
    }
    pages[`https://example.org/${MAX_REDIRECTS}`] = html("<title>End</title>");
    const { unfurler, resolve } = web({ "example.org": [PUBLIC] }, pages);

    expect(
      await body(await ask(serving(unfurler), "https://example.org/0")),
    ).toEqual({ url: "https://example.org/0", reached: true, title: "End" });
    expect(resolve).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it("gives up past the redirect cap", async () => {
    const pages: Record<string, Page> = {};
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      pages[`https://example.org/${hop}`] = redirect(`/${hop + 1}`);
    }
    pages[`https://example.org/${MAX_REDIRECTS + 1}`] =
      html("<title>End</title>");
    const { unfurler, fetch } = web({ "example.org": [PUBLIC] }, pages);

    expect(
      await body(await ask(serving(unfurler), "https://example.org/0")),
    ).toEqual({ url: "https://example.org/0", reached: false });
    expect(fetch).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it.each([
    ["an internal name", "http://intranet.example/"],
    ["a loopback literal", "http://127.0.0.1/"],
    ["the metadata address", "http://169.254.169.254/latest"],
    ["an IPv6 loopback literal", "http://[::1]/"],
    ["a non-http scheme", "file:///etc/passwd"],
  ])("does not follow a redirect to %s", async (_what, location) => {
    const { unfurler, fetch } = web(
      {
        "example.org": [PUBLIC],
        "intranet.example": [{ address: "10.0.0.5", family: 4 }],
      },
      { "https://example.org/": redirect(location) },
    );

    expect(
      await body(await ask(serving(unfurler), "https://example.org/")),
    ).toEqual({ url: "https://example.org/", reached: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("answers unreached when the target outlasts the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { unfurler } = web(
      { "example.org": [PUBLIC] },
      { "https://example.org/": () => new Promise<Fetched>(() => undefined) },
    );
    const host = serving(unfurler);

    const answering = ask(host, "https://example.org/");
    await vi.advanceTimersByTimeAsync(UNFURL_TIMEOUT_MS);

    expect(await body(await answering)).toEqual({
      url: "https://example.org/",
      reached: false,
    });
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["10.0.0.1", "private"],
    ["172.20.0.1", "private"],
    ["192.168.0.10", "private"],
    ["169.254.169.254", "link-local"],
    ["100.64.1.1", "shared"],
    ["0.0.0.0", "unspecified"],
    ["224.0.0.251", "multicast"],
    ["240.0.0.1", "reserved"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fd00::1", "unique-local"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ])("refuses %s (%s), by literal and by name", async (address) => {
    const family = address.includes(":") ? 6 : 4;
    const { unfurler, fetch } = web(
      { "inside.example": [{ address, family }] },
      {},
    );
    const host = serving(unfurler);
    const literal = family === 6 ? `[${address}]` : address;

    for (const url of [`http://${literal}/`, "http://inside.example/"]) {
      const response = await ask(host, url);
      expect(response.status).toBe(422);
      expect(await body(response)).toEqual({
        error: { code: "address-refused", url },
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a name where any one of its addresses is refused", async () => {
    const { unfurler, fetch } = web(
      {
        "mixed.example": [PUBLIC, { address: "127.0.0.1", family: 4 }],
      },
      {},
    );

    const response = await ask(serving(unfurler), "http://mixed.example/");
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses the loopback spelled as a decimal", async () => {
    const { unfurler } = web({}, {});

    const response = await ask(serving(unfurler), "http://2130706433/");
    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "address-refused" },
    });
  });

  it("fetches the address it checked, however the name answers afterwards", async () => {
    let asked = 0;
    const { unfurler, fetch, resolve } = web(
      {
        "rebind.example": () =>
          asked++ === 0 ? [PUBLIC] : [{ address: "127.0.0.1", family: 4 }],
      },
      { "http://rebind.example/": html("<title>Outside</title>") },
    );

    const response = await ask(serving(unfurler), "http://rebind.example/");

    expect(await body(response)).toMatchObject({ reached: true });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toEqual(PUBLIC);
  });

  it.each([
    ["missing", ""],
    ["unparseable", "not a url"],
    ["not http", "ftp://example.org/"],
    ["carrying credentials", "https://me:secret@example.org/"],
  ])("refuses an address that is %s", async (_what, url) => {
    const { unfurler } = web({}, {});
    const host = serving(unfurler);

    const response =
      url === "" ? await host.app.request("/v1/unfurl") : await ask(host, url);
    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({ error: { code: "bad-url", url } });
  });

  it("serves a second read inside the hour without fetching again", async () => {
    const { unfurler, fetch, advance } = web(
      { "example.org": [PUBLIC] },
      { "https://example.org/": html("<title>Once</title>") },
    );
    const host = serving(unfurler);

    await ask(host, "https://example.org/");
    advance(UNFURL_LIFETIME_MS - 1);
    expect(await body(await ask(host, "https://example.org/"))).toMatchObject({
      title: "Once",
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    advance(1);
    await ask(host, "https://example.org/");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("holds a failure for minutes, not the hour", async () => {
    const { unfurler, fetch, advance } = web({ "example.org": [PUBLIC] }, {});
    const host = serving(unfurler);

    await ask(host, "https://example.org/down");
    advance(FAILED_UNFURL_LIFETIME_MS - 1);
    await ask(host, "https://example.org/down");
    expect(fetch).toHaveBeenCalledTimes(1);

    advance(1);
    await ask(host, "https://example.org/down");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("holds a refusal as long as a failure, without looking the name up again", async () => {
    const { unfurler, resolve, advance } = web(
      { "inside.example": [{ address: "10.0.0.1", family: 4 }] },
      {},
    );
    const host = serving(unfurler);

    await ask(host, "http://inside.example/");
    const again = await ask(host, "http://inside.example/");
    expect(again.status).toBe(422);
    expect(resolve).toHaveBeenCalledTimes(1);

    advance(FAILED_UNFURL_LIFETIME_MS);
    await ask(host, "http://inside.example/");
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("asks once for two reads of the same link at the same time", async () => {
    const { unfurler, fetch } = web(
      { "example.org": [PUBLIC] },
      { "https://example.org/": html("<title>Once</title>") },
    );
    const host = serving(unfurler);

    await Promise.all([
      ask(host, "https://example.org/"),
      ask(host, "https://example.org/"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is refused while the pool setting is off, and reaches nothing", async () => {
    const { unfurler, resolve, fetch } = web(
      { "example.org": [PUBLIC] },
      { "https://example.org/": html("<title>Never</title>") },
    );
    const host = serving(unfurler);
    await host.pool.settings.change("unfurl" as PoolSettingName, false);

    const response = await ask(host, "https://example.org/");

    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      error: { code: "unfurl-off", setting: "unfurl" },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("turns away a caller who has not signed in, and reaches nothing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notemap-route-unfurl-"));
    directories.push(directory);
    const auth = createAuth(
      createSqliteAuthStore({ file: join(directory, "auth.db") }),
      { clock: { now: () => new Date().toISOString() as Timestamp } },
    );
    await auth.setPassword("anton", "correct horse battery staple");
    const { unfurler, resolve } = web({ "example.org": [PUBLIC] }, {});
    const host = daemon(undefined, { auth, unfurler });
    open.push(host);

    const response = await ask(host, "https://example.org/");

    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });
});
