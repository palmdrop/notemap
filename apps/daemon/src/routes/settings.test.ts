import { afterEach, describe, expect, it } from "vitest";

import type { PoolConfig, PoolSettingName } from "@notemap/core";

import { CONFIG, daemon, type Daemon } from "../testing/fixture";

/** A second pool setting nothing ships, so a `PATCH` naming one can prove the other is untouched. */
const TWO_SETTINGS: PoolConfig = {
  ...CONFIG,
  poolSettings: [
    ...CONFIG.poolSettings,
    { name: "second" as PoolSettingName, type: "boolean", default: true },
  ],
};

const open: Daemon[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function serving(): Daemon {
  const host = daemon();
  open.push(host);
  return host;
}

const body = (response: Response) => response.json() as Promise<never>;

async function patch(host: Daemon, content: unknown): Promise<Response> {
  return host.app.request("/v1/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(content),
  });
}

describe("GET /v1/settings", () => {
  it("answers every known setting's default before anything is written", async () => {
    const host = serving();

    const response = await host.app.request("/v1/settings");
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      values: [{ name: "unfurl", value: true }],
    });
  });
});

describe("PATCH /v1/settings", () => {
  it("is readable back", async () => {
    const host = serving();

    const patched = await patch(host, { unfurl: false });
    expect(patched.status).toBe(200);
    expect(await body(patched)).toEqual({
      values: [{ name: "unfurl", value: false }],
    });

    const read = await host.app.request("/v1/settings");
    expect(await body(read)).toEqual({
      values: [{ name: "unfurl", value: false }],
    });
  });

  it("refuses a name this daemon does not know, with the allowed names", async () => {
    const host = serving();

    const response = await patch(host, { ghost: true });
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: {
        code: "unknown-pool-setting",
        setting: "ghost",
        allowed: ["unfurl"],
      },
    });
  });

  it("refuses a value of the wrong type, with what was expected", async () => {
    const host = serving();

    const response = await patch(host, { unfurl: "yes" });
    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: {
        code: "pool-setting-invalid",
        setting: "unfurl",
        expected: "boolean",
      },
    });
  });

  it("refuses an empty body", async () => {
    const host = serving();

    const response = await patch(host, {});
    expect(response.status).toBe(400);
  });

  it("naming one pool setting leaves the others alone", async () => {
    const host = daemon(TWO_SETTINGS);
    open.push(host);

    const patched = await patch(host, { unfurl: false });
    expect(patched.status).toBe(200);
    expect(await body(patched)).toEqual({
      values: [
        { name: "unfurl", value: false },
        { name: "second", value: true },
      ],
    });
  });
});
