import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import { capturedLog, type CapturedLog } from "../log/testing";
import type { AppEnv } from "../types";
import { noticeOrigin } from "./origin";

let warned: CapturedLog;

beforeEach(() => {
  warned = capturedLog();
});

const appWith = (origin?: string): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("*", noticeOrigin(origin, warned.log));
  app.get("*", (context) => context.body(null, 204));

  return app;
};

const reached = async (host: string, origin?: string): Promise<Response> =>
  appWith(origin).request("/v1/session", { headers: { host } });

const said = () => warned.said();

describe("noticing where a daemon is reached", () => {
  it("lets the request through whatever it says", async () => {
    expect((await reached("notemap.internal:4747")).status).toBe(204);
  });

  it("says nothing to a browser on loopback", async () => {
    await reached("127.0.0.1:4747");

    expect(warned.lines()).toEqual([]);
  });

  it("names the key to set where a daemon configured none", async () => {
    await reached("notemap.internal:4747");

    expect(said()).toMatch(
      /^.* WARN .*daemon\.origin.*arrivedFor=notemap\.internal:4747/,
    );
  });

  it("says a configured origin back where a request disagrees with it", async () => {
    await reached("notemap.internal:4747", "https://notes.example.com");

    expect(said()).toContain("origin=https://notes.example.com");
  });

  it("says nothing where the request and the configured origin agree", async () => {
    await reached("notes.example.com", "https://notes.example.com");

    expect(warned.lines()).toEqual([]);
  });

  /**
   * A guess about somebody else's network, repeated per request, is noise a
   * person stops reading — and this has to be read exactly once.
   */
  it("says it once and then stops", async () => {
    const app = appWith();

    await app.request("/v1/session", { headers: { host: "notemap.internal" } });
    await app.request("/v1/session", { headers: { host: "notemap.internal" } });

    expect(warned.lines()).toHaveLength(1);
  });
});
