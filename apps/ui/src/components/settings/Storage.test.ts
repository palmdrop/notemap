import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import type { Storage } from "@notemap/client";
import { json, routeOf } from "@notemap/client/testing";

import { tick } from "svelte";

import { online } from "$testing/dom";
import { asked, pool } from "$testing/pool";
import StorageSection from "./Storage.svelte";

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

const REPORT: Storage = {
  pool: {
    path: "/var/lib/notemap/state/notemap.db",
    bytes: 4_300_000,
    unused: 65_536,
    free: 52_000_000_000,
  },
  assets: {
    // `saved` is the registry's own answer and deliberately not the difference
    // between these bytes and the blobs below: the store also holds the outputs
    // routing records name, which no asset does.
    path: "/var/lib/notemap/assets",
    count: 142,
    bytes: 88_200_000,
    saved: 23_600_000,
    free: 52_000_000_000,
  },
  mirror: { path: "/var/lib/notemap/pool-mirror", free: 52_000_000_000 },
  auth: { path: "/var/lib/notemap/state/auth.db", bytes: 32_768 },
  deployment: { name: "docker", contained: true },
};

const MEASURED: NonNullable<Storage["measured"]> = {
  at: "2026-10-12T09:14:02.000Z",
  blobs: { count: 140, bytes: 70_000_000 },
  reclaimable: { count: 2, bytes: 714_016 },
  withinGrace: { count: 1, bytes: 1_024 },
  mirror: { records: 1_204, files: 2_408, bytes: 3_500_000 },
};

/** The daemon's two halves, each answered by whatever a test hands in. */
function serving(
  read: () => Response,
  measure: () => Response | Promise<Response>,
  reclaim: () => Response = () => json(200, { blobs: 0, bytes: 0 }),
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/storage") return read();
    if (route === "POST /v1/storage/measure") return measure();
    if (route === "POST /v1/reclaim") return reclaim();
    return json(200, {});
  });
}

test("draws every figure from one answer", async () => {
  serving(
    () => json(200, REPORT),
    () => json(200, { ...REPORT, measured: MEASURED }),
  );

  render(StorageSection);

  await screen.findByText("/var/lib/notemap/state/notemap.db");
  await screen.findByText("4.3 MB");
  await screen.findByText(/^\(52 GB free\)$/);
  // The database's free pages are answered on the wire and drawn nowhere:
  // nothing a person can press returns them to the disk.
  expect(screen.queryByText(/66 KB/)).toBeNull();

  // The assets row's footprint is the blobs the walk found, not the sum of the
  // assets naming them.
  await screen.findByText("70 MB");
  await screen.findByText(/140 blobs \(52 GB free\)/);
  await screen.findByText(/142 assets, 24 MB saved/);

  await screen.findByText("3.5 MB");
  await screen.findByText(/1,204 records, 2,408 files/);
  await screen.findByText("33 KB");
  await screen.findByText("docker");
  await screen.findByText(/1 blob waiting out the grace window/);

  expect(asked()).toContain("GET /v1/storage");
  expect(asked()).toContain("POST /v1/storage/measure");
});

test("draws the remembered figures and the ask while a measurement is out, never nothing", async () => {
  let release: ((response: Response) => void) | undefined;
  serving(
    () => json(200, { ...REPORT, measured: MEASURED }),
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );

  render(StorageSection);

  // The remembered walk, drawn from the cheap read while the fresh one is out.
  await screen.findByText(/140 blobs/);
  expect(screen.getAllByRole("status").length).toBeGreaterThan(0);

  release?.(
    json(200, {
      ...REPORT,
      measured: { ...MEASURED, blobs: { count: 7, bytes: 1_000 } },
    }),
  );

  await screen.findByText(/7 blobs/);
});

test("the reclaim is inert where there is nothing to take", async () => {
  serving(
    () => json(200, REPORT),
    () =>
      json(200, {
        ...REPORT,
        measured: {
          ...MEASURED,
          reclaimable: { count: 0, bytes: 0 },
          withinGrace: { count: 0, bytes: 0 },
        },
      }),
  );

  render(StorageSection);

  await screen.findByText(/no unused blobs/);
  const button = await screen.findByRole<HTMLButtonElement>("button", {
    name: "reclaim now",
  });
  expect(button.disabled).toBe(true);
});

test("the reclaim fires, says what it took, and asks again", async () => {
  const measured = [
    { ...REPORT, measured: MEASURED },
    {
      ...REPORT,
      measured: {
        ...MEASURED,
        blobs: { count: 138, bytes: 69_285_984 },
        reclaimable: { count: 0, bytes: 0 },
      },
    },
  ];
  let walks = 0;
  serving(
    () => json(200, REPORT),
    () => json(200, measured[Math.min(walks++, 1)]),
    () => json(200, { blobs: 2, bytes: 714_016 }),
  );

  render(StorageSection);
  await screen.findByText(/2 unused blobs, 714 KB/);

  await press("reclaim now");

  await screen.findByText(/took 2 blobs, 714 KB/);
  await screen.findByText(/no unused blobs/);
  expect(asked().filter((route) => route === "POST /v1/reclaim")).toHaveLength(
    1,
  );
});

/** What a reclaim took explains the figures beside it, and only those. */
test("drops what a reclaim took once the section looks again", async () => {
  const taken = {
    ...REPORT,
    measured: { ...MEASURED, reclaimable: { count: 0, bytes: 0 } },
  };
  let walks = 0;
  const transport = serving(
    () => json(200, REPORT),
    () => json(200, walks++ === 0 ? { ...REPORT, measured: MEASURED } : taken),
    () => json(200, { blobs: 2, bytes: 714_016 }),
  );

  render(StorageSection);
  await screen.findByText(/2 unused blobs, 714 KB/);

  await press("reclaim now");
  await screen.findByText(/took 2 blobs, 714 KB/);

  transport.unreachable(true);
  online(false);
  await tick();
  transport.unreachable(false);
  online(true);

  await vi.waitFor(() => expect(screen.queryByText(/took 2 blobs/)).toBeNull());
});

test("says it is unavailable rather than guessing while the pool is out of reach", async () => {
  const transport = serving(
    () => json(200, REPORT),
    () => json(200, { ...REPORT, measured: MEASURED }),
  );
  transport.unreachable(true);

  render(StorageSection);

  await screen.findByText(/unavailable while the pool is unreachable/);
  // No figure is drawn from nothing: there is nothing cached to draw.
  expect(screen.queryByText(/blobs/)).toBeNull();
});
