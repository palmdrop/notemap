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
      "/v1/archived",
      "/v1/assets/{id}",
      "/v1/assets/{id}/content",
      "/v1/captures",
      "/v1/destination-kinds",
      "/v1/destinations",
      "/v1/destinations/{id}",
      "/v1/destinations/{id}/candidates",
      "/v1/destinations/{id}/description",
      "/v1/destinations/{id}/probe",
      "/v1/destinations/{id}/remembered",
      "/v1/destinations/{id}/retire",
      "/v1/destinations/{id}/unretire",
      "/v1/feed",
      "/v1/health",
      "/v1/items/{id}",
      "/v1/items/{id}/archive",
      "/v1/items/{id}/edit",
      "/v1/items/{id}/mark-processed",
      "/v1/items/{id}/route",
      "/v1/items/{id}/route/preview",
      "/v1/items/{id}/routing",
      "/v1/items/{id}/tag",
      "/v1/items/{id}/unarchive",
      "/v1/items/{id}/untag",
      "/v1/queue",
      "/v1/routing/{record}/cancel",
      "/v1/routing/{record}/output",
      "/v1/session",
      "/v1/sessions",
      "/v1/tags",
      "/v1/tokens",
      "/v1/tokens/{id}",
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
      Object.keys(document.paths["/v1/queue"]?.get?.responses ?? {}).sort(),
    ).toEqual(["200", "422"]);
    expect(
      Object.keys(document.paths["/v1/archived"]?.get?.responses ?? {}).sort(),
    ).toEqual(["200", "422"]);
    for (const path of ["/v1/items/{id}/archive", "/v1/items/{id}/unarchive"]) {
      expect(
        Object.keys(document.paths[path]?.post?.responses ?? {}).sort(),
        path,
      ).toEqual(["200", "400", "404", "409", "415"]);
    }
    expect(
      Object.keys(
        document.paths["/v1/items/{id}/mark-processed"]?.post?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "400", "404", "415"]);
    expect(
      Object.keys(
        document.paths["/v1/items/{id}/routing"]?.get?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "404"]);
    expect(
      Object.keys(document.paths["/v1/actions"]?.get?.responses ?? {}).sort(),
    ).toEqual(["200", "422"]);
    expect(
      Object.keys(
        document.paths["/v1/assets/{id}"]?.put?.responses ?? {},
      ).sort(),
    ).toEqual(["200", "201", "409", "413", "415", "422"]);
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
