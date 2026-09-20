import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { capturedLog } from "../log/testing";
import type { AppEnv } from "../types";
import { json, refuse } from "../utils/responses";
import { logRequests } from "./request-log";

function appWith(level: "debug" | "info" = "debug") {
  const captured = capturedLog({ level, format: "text" });
  const app = new Hono<AppEnv>();
  app.use("*", logRequests(captured.log));
  app.get("/v1/health", () => json({ ok: true }, 200));
  app.get("/v1/items/:id", () => refuse({ kind: "unknown-route", path: "/x" }));
  app.get("/v1/mine", (context) => {
    context.set("identity", { kind: "token", id: "t1" as never, name: "cli" });
    return json({}, 200);
  });
  return { app, ...captured };
}

describe("the request line", () => {
  it("names the method, the path, the status, the time and who asked", async () => {
    const { app, lines } = appWith();

    await app.request("/v1/health");

    expect(lines()).toEqual([
      expect.stringMatching(
        /^DEBUG request method=GET path=\/v1\/health status=200 ms=\d+ by=nobody$/,
      ),
    ]);
  });

  it("carries the refusal's code", async () => {
    const { app, lines } = appWith();

    await app.request("/v1/items/i1");

    expect(lines()[0]).toMatch(/status=404 .*code=unknown-route$/);
  });

  it("says a token asked where one did", async () => {
    const { app, lines } = appWith();

    await app.request("/v1/mine");

    expect(lines()[0]).toMatch(/by=token$/);
  });

  it("is quiet at info", async () => {
    const { app, lines } = appWith("info");

    await app.request("/v1/health");

    expect(lines()).toEqual([]);
  });

  it("leaves the response readable", async () => {
    const { app } = appWith();

    const response = await app.request("/v1/items/i1");

    expect(await response.json()).toMatchObject({
      error: { code: "unknown-route" },
    });
  });
});
