import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { daemon, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function started(): Daemon {
  const it = daemon();
  open.push(it);
  return it;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
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
