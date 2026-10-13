import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Duration } from "@notemap/core";
import { createAuth } from "@notemap/daemon/src/auth/index.ts";
import { createSqliteAuthStore } from "@notemap/daemon/src/auth/store/index.ts";
import type { AuthStore } from "@notemap/daemon/src/auth/store/types.ts";
import { openAccounts, systemClock } from "@notemap/daemon/src/ports.ts";
import {
  CONFIG,
  daemon,
  type Daemon,
} from "@notemap/daemon/src/testing/fixture.ts";
import { CHEAP_HASHING } from "@notemap/daemon/src/testing/hashing.ts";
import {
  startArenaServer,
  type ArenaServer,
} from "@notemap/destination-arena/testing";
import {
  startDavServer,
  type DavServer,
} from "@notemap/destination-webdav/testing";

import { HttpFailure } from "./http.ts";
import { readFixture, type Fixture } from "./fixtures.ts";
import { seed } from "./seed.ts";

const PASSWORD = "correct horse battery staple";

const closing: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closing.splice(0).reverse()) await close();
});

type Stage = {
  readonly host: Daemon;
  readonly dav: DavServer;
  readonly arena: ArenaServer;
  readonly fetch: typeof globalThis.fetch;
};

/**
 * A daemon holding a password, with a WebDAV and an are.na account each
 * pointing at a fake. Firing waits for nothing, so a delivery a trigger tag
 * owes is claimable as soon as it is made.
 */
async function staged(): Promise<Stage> {
  const dav = await startDavServer();
  closing.push(() => dav.close());
  const arena = await startArenaServer();
  closing.push(() => arena.close());

  const directory = mkdtempSync(join(tmpdir(), "notemap-seed-"));
  const store: AuthStore = createSqliteAuthStore({
    file: join(directory, "auth.db"),
  });
  closing.push(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const auth = createAuth(store, {
    clock: systemClock,
    hashing: CHEAP_HASHING,
  });
  await auth.setPassword("admin", PASSWORD);

  process.env["NOTEMAP_SEED_TEST_DAV"] = dav.password;
  process.env["NOTEMAP_SEED_TEST_ARENA"] = arena.token;
  const accounts = await openAccounts({
    store,
    clock: systemClock,
    config: [
      {
        kind: "webdav",
        name: "webdav",
        baseUrl: dav.baseUrl,
        username: dav.username,
        passwordEnv: "NOTEMAP_SEED_TEST_DAV",
      },
      {
        kind: "arena",
        name: "arena",
        baseUrl: arena.url,
        secretEnv: "NOTEMAP_SEED_TEST_ARENA",
      },
    ],
  });

  const host = daemon(
    { ...CONFIG, triggerWindow: 0 as Duration },
    { auth, accounts, vault: "ready" },
  );
  closing.push(() => host.cleanup());

  return {
    host,
    dav,
    arena,
    fetch: (input, init) =>
      Promise.resolve(host.app.request(String(input), init)),
  };
}

function fixtureFor(stage: Stage): Fixture {
  return readFixture({
    links: "http://pages.test/",
    destinations: [
      {
        name: "Vault",
        kind: "filesystem",
        settings: { root: stage.host.vaultRoot },
      },
      {
        name: "Cloud",
        kind: "webdav",
        settings: { account: "webdav", root: "" },
      },
      { name: "Board", kind: "arena", settings: { account: "arena" } },
    ],
    templates: [
      {
        name: "To the vault",
        destination: "Vault",
        capability: "create",
        arguments: { directory: "seeded", filename: "{{item}}.md" },
        folder: "create",
        triggerTag: "route/vault",
      },
      {
        name: "To the cloud",
        destination: "Cloud",
        capability: "create",
        arguments: { directory: "seeded", filename: "{{item}}.md" },
        folder: "create",
        triggerTag: "route/cloud",
      },
      {
        name: "To the board",
        destination: "Board",
        capability: "create",
        arguments: { channel: "seeded" },
        triggerTag: "route/board",
      },
    ],
  });
}

describe("seeding a daemon behind a password", () => {
  it("is refused without one", async () => {
    const stage = await staged();

    await expect(
      seed("http://stage.test", { fetch: stage.fetch }),
    ).rejects.toBeInstanceOf(HttpFailure);
  });

  it("is refused with the wrong one", async () => {
    const stage = await staged();

    await expect(
      seed("http://stage.test", { fetch: stage.fetch, password: "not it" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("signs in, lays out the fixture, and routes to every destination", async () => {
    const stage = await staged();

    const seeded = await seed("http://stage.test", {
      fetch: stage.fetch,
      password: PASSWORD,
      fixture: fixtureFor(stage),
    });
    await stage.host.deliver();

    expect(seeded.routed).toHaveLength(3);
    expect(new Set(seeded.routed.map((each) => each.destination)).size).toBe(3);

    expect(readdirSync(join(stage.host.vaultRoot, "seeded"))).toHaveLength(1);
    expect(
      Object.keys(stage.dav.files()).filter((path) =>
        path.startsWith("seeded/"),
      ),
    ).toHaveLength(1);
    expect(stage.arena.blocks()).toEqual([
      expect.objectContaining({
        channel_ids: ["seeded"],
        value: expect.stringContaining("http://pages.test/"),
      }),
    ]);
  });

  it("makes nothing twice when seeded again", async () => {
    const stage = await staged();
    const options = {
      fetch: stage.fetch,
      password: PASSWORD,
      fixture: fixtureFor(stage),
    };

    await seed("http://stage.test", options);
    await seed("http://stage.test", options);
    await stage.host.deliver();

    const listed = (await (
      await stage.fetch("http://stage.test/v1/templates", {
        headers: { cookie: await cookie(stage) },
      })
    ).json()) as { values: unknown[] };
    expect(listed.values).toHaveLength(3);
    expect(stage.arena.blocks()).toHaveLength(1);
  });
});

async function cookie(stage: Stage): Promise<string> {
  const response = await stage.fetch("http://stage.test/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "admin", password: PASSWORD }),
  });
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}
