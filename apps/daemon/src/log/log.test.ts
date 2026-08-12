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
