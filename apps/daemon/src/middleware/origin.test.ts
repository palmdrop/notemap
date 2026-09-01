import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../types";
import { noticeOrigin } from "./origin";

const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

afterEach(() => {
  warned.mockClear();
});

const appWith = (origin?: string): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("*", noticeOrigin(origin));
  app.get("*", (context) => context.body(null, 204));

  return app;
};

const reached = async (host: string, origin?: string): Promise<Response> =>
  appWith(origin).request("/v1/session", { headers: { host } });

const said = () => warned.mock.calls.map(([first]) => String(first)).join("\n");

describe("noticing where a daemon is reached", () => {
  it("lets the request through whatever it says", async () => {
    expect((await reached("notemap.internal:4747")).status).toBe(204);
  });

  it("says nothing to a browser on loopback", async () => {
    await reached("127.0.0.1:4747");

    expect(warned).not.toHaveBeenCalled();
  });

  it("names the key to set where a daemon configured none", async () => {
    await reached("notemap.internal:4747");

    expect(said()).toContain("notemap.internal:4747");
    expect(said()).toContain("daemon.origin");
  });

  it("says a configured origin back where a request disagrees with it", async () => {
    await reached("notemap.internal:4747", "https://notes.example.com");

    expect(said()).toContain("https://notes.example.com");
  });

  it("says nothing where the request and the configured origin agree", async () => {
    await reached("notes.example.com", "https://notes.example.com");

    expect(warned).not.toHaveBeenCalled();
  });

  /**
   * A guess about somebody else's network, repeated per request, is noise a
   * person stops reading — and this has to be read exactly once.
   */
  it("says it once and then stops", async () => {
    const app = appWith();

    await app.request("/v1/session", { headers: { host: "notemap.internal" } });
    await app.request("/v1/session", { headers: { host: "notemap.internal" } });

    expect(warned).toHaveBeenCalledTimes(1);
  });
});
