import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { OPENAPI_FILE } from "./openapi";
import { daemon, type Daemon } from "./testing/fixture";

const open: Daemon[] = [];

function serving() {
  const started = daemon();
  open.push(started);
  return started.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

describe("GET /v1/openapi.json", () => {
  it("serves an OpenAPI 3.1 document describing every route", async () => {
    const app = serving();

    const response = await app.request("/v1/openapi.json");
    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).sort()).toEqual([
      "/v1/actions",
      "/v1/assets",
      "/v1/assets/{id}",
      "/v1/assets/{id}/content",
      "/v1/captures",
      "/v1/feed",
      "/v1/items/{id}",
    ]);
    expect(Object.keys(document.paths["/v1/captures"] ?? {})).toEqual(["post"]);
  });

  it("matches the copy checked into the repo", async () => {
    const app = serving();

    const served = await (await app.request("/v1/openapi.json")).json();
    const checkedIn: unknown = JSON.parse(readFileSync(OPENAPI_FILE, "utf8"));

    // Regenerate with `pnpm --filter @notemap/daemon openapi` when this fails.
    expect(served).toEqual(checkedIn);
  });

  it("documents every status the refusal table gives a route", async () => {
    const app = serving();
    const document = (await (await app.request("/v1/openapi.json")).json()) as {
      paths: Record<string, Record<string, { responses: object }>>;
    };

    expect(
      Object.keys(document.paths["/v1/captures"]?.post?.responses ?? {}).sort(),
    ).toEqual(["200", "201", "400", "409", "415", "422"]);
    expect(
      Object.keys(document.paths["/v1/feed"]?.get?.responses ?? {}).sort(),
    ).toEqual(["200", "422"]);
    expect(
      Object.keys(
        document.paths["/v1/items/{id}"]?.get?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "404"]);
    expect(
      Object.keys(document.paths["/v1/actions"]?.get?.responses ?? {}).sort(),
    ).toEqual(["200", "422"]);
    expect(
      Object.keys(document.paths["/v1/assets"]?.post?.responses ?? {}).sort(),
    ).toEqual(["201", "413", "415", "422"]);
    expect(
      Object.keys(
        document.paths["/v1/assets/{id}"]?.get?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "404"]);
    expect(
      Object.keys(
        document.paths["/v1/assets/{id}/content"]?.get?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "404"]);
  });
});
