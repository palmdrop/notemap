import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Clock, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import { daemon, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];
const stores: { store: AuthStore; directory: string }[] = [];

const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
};

function started(): Daemon {
  const it = daemon();
  open.push(it);
  return it;
}

/** A daemon with a password set, which is the only state where the door is shut. */
async function guarded(): Promise<Daemon> {
  const directory = mkdtempSync(join(tmpdir(), "notemap-log-auth-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });
  stores.push({ store, directory });

  const auth = createAuth(store, { clock: systemClock });
  await auth.setPassword("anton", "correct horse battery staple");

  const it = daemon(undefined, { auth });
  open.push(it);
  return it;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

/**
 * The page is a file, not a rendering: everything it draws it asks `/v1` for,
 * and that is behind the door. So it stays reachable for the same reason the
 * shell's own files do — it is the application, not the pool — and shutting it
 * would answer a person a refusal envelope where they asked for a page.
 */
describe("the log page with the door shut", () => {
  it("is still served, because it is the application rather than the pool", async () => {
    const { app } = await guarded();

    const response = await app.request("/log");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("answers no pool material, having none to answer", async () => {
    const { app, pool } = await guarded();
    const identity = await pool.identity();

    const page = await (await app.request("/log")).text();

    expect(page).not.toContain(identity);
    // What it would draw is refused to the caller that asked for the page.
    expect((await app.request("/v1/actions")).status).toBe(401);
  });
});

describe("the log page", () => {
  it("serves a page that reads the log from the daemon that served it", async () => {
    const { app } = started();

    const response = await app.request("/log");
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(page).toContain("/v1/actions");
  });

  it("loads nothing from anywhere but the daemon", async () => {
    const { app } = started();

    const page = await (await app.request("/log")).text();
    const remote = [...page.matchAll(/(?:src|href)="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(remote.every((url) => url?.startsWith("/"))).toBe(true);
  });

  it("is not part of the /v1 contract", async () => {
    const { app } = started();

    const document = (await (await app.request("/v1/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).not.toContain("/log");
  });

  it("answers OPTIONS the way every known path does", async () => {
    const { app } = started();

    const response = await app.request("/log", { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});

/**
 * The page is the daemon's own and cannot reach the app's compiled stylesheet,
 * so it restates the roles. Two copies of a palette drift the moment one moves;
 * this is what stops them.
 */
describe("the log page's copy of the shell's roles", () => {
  const roles = ["paper", "ink", "ink-muted", "accent"] as const;

  function declared(css: string, prefix: string): Record<string, string> {
    const found: Record<string, string> = {};
    for (const role of roles) {
      const at = new RegExp(`--${prefix}${role}:\\s*([^;]+);`).exec(css);
      if (at?.[1] !== undefined)
        found[role] = at[1].replace(/\s+/g, " ").trim();
    }
    return found;
  }

  const read = (from: string) =>
    readFileSync(fileURLToPath(new URL(from, import.meta.url)), "utf8");

  it("says the same thing as the tokens it was copied from", () => {
    const page = declared(read("../../public/log.html"), "");
    const tokens = declared(
      read("../../../ui/src/styles/tokens.css"),
      "color-",
    );

    expect(Object.keys(tokens).sort()).toEqual([...roles].sort());
    expect(page).toEqual(tokens);
  });
});
