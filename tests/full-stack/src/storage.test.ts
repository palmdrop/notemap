import { describe, expect, it } from "vitest";

import { daemons, WEB } from "./harness/index.ts";

const daemon = daemons();

type Tally = { count: number; bytes: number };

type Report = {
  pool: { path: string; bytes: number; unused: number; free?: number };
  assets: { path: string; count: number; bytes: number; free?: number };
  mirror?: { path: string; free?: number };
  auth?: { path: string; bytes: number };
  deployment?: string;
  measured?: {
    at: string;
    blobs: Tally;
    reclaimable: Tally;
    withinGrace: Tally;
    mirror?: { records: number; files: number; bytes: number };
  };
};

/** Over `fetch`, as health is: the route is the thing under test. */
async function storage(url: string, measure = false): Promise<Report> {
  const response = await fetch(
    `${url}/v1/storage${measure ? "/measure" : ""}`,
    measure
      ? { method: "POST", headers: { "content-type": "application/json" } }
      : undefined,
  );

  expect(response.status).toBe(200);
  return (await response.json()) as Report;
}

describe("what a running daemon says it takes", () => {
  it("names the paths its own config file named, and what is free where each lives", async () => {
    const running = await daemon();

    const report = await storage(running.url);

    expect(report.pool.path).toBe(running.world.pool);
    expect(report.assets.path).toBe(running.world.assets);
    expect(report.mirror?.path).toBe(running.world.mirror);
    expect(report.auth?.path).toBe(running.world.auth);
    expect(report.pool.bytes).toBeGreaterThan(0);
    expect(report.auth?.bytes).toBeGreaterThan(0);
    expect(report.pool.free).toBeGreaterThan(0);
    expect(report.assets.free).toBeGreaterThan(0);
    expect(report.measured).toBeUndefined();
  });

  it("claims the deployment its image declares, and none where nothing says", async () => {
    const declared = await daemon(undefined, {
      NOTEMAP_DEPLOYMENT: "docker",
    });

    expect((await storage(declared.url)).deployment).toBe("docker");
    expect(await declared.stop()).toBe(0);

    const plain = await daemon();
    expect((await storage(plain.url)).deployment).toBeUndefined();
  });

  it("measures the blob store on request, and a reclaim takes nothing of it", async () => {
    const running = await daemon();
    const client = running.client;
    const asset = await client.attach(
      new File([new Uint8Array([1, 2, 3, 4])], "note.bin", {
        type: "application/octet-stream",
      }),
    );
    await client.capture({
      channel: WEB,
      text: "with a file",
      assets: [asset],
    });
    await client.drain();

    const measured = await storage(running.url, true);

    expect(measured.measured?.blobs).toEqual({ count: 1, bytes: 4 });
    expect(measured.measured?.reclaimable).toEqual({ count: 0, bytes: 0 });
    expect(measured.measured?.at).toEqual(expect.any(String));

    const reclaimed = await fetch(`${running.url}/v1/reclaim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(await reclaimed.json()).toEqual({ blobs: 0, bytes: 0 });

    // The bytes are still there, and the remembered figure still says so.
    expect((await storage(running.url)).measured?.blobs).toEqual({
      count: 1,
      bytes: 4,
    });
  });
});
