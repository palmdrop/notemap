import type {
  CapabilityName,
  DestinationId,
  Duration,
  Item,
  PoolConfig,
} from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  backdate,
  bytes,
  CONFIG,
  drainWith,
  envelope,
  harness,
  streamOf,
  upload,
  type Harness,
} from "./fixture";

const open: Harness[] = [];

function pool(config: PoolConfig = CONFIG): Harness {
  const started = harness(config, "filesystem");
  open.push(started);
  return started;
}

const VAULT = "vault" as DestinationId;

/** A pool that can take a delivery, so an output's blob reaches the store. */
async function delivering(wrote: string) {
  const destinations = fakeDestinations({
    capabilities: [fakeCapability({ name: "create-note" })],
  });
  destinations.answers({
    kind: "delivered",
    pointer: "vault/inbox/a-thought.md",
    output: {
      content: {
        mediaType: "text/markdown",
        open: () => Promise.resolve(streamOf(bytes(wrote))),
      },
    },
  });

  const started = harness(CONFIG, "filesystem", destinations);
  open.push(started);
  await started.putDestination({ id: VAULT });
  return started;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((started) => started.cleanup()));
});

/** No grace at all, so a blob is the reclaim's as soon as its file is old. */
const IMPATIENT: PoolConfig = { ...CONFIG, sweep: { grace: 0 as Duration } };

describe("what the pool says it takes", () => {
  it("answers what it has written down without walking anything", async () => {
    const started = pool();
    const picture = bytes("a picture of something");
    const asset = await upload(started.pool, "photo.png", picture);
    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: asset.id }] }),
    );

    const held = await started.pool.storage.recorded();

    expect(held.assets).toEqual({
      count: 1,
      bytes: picture.byteLength,
      saved: 0,
    });
    expect(held.store.bytes).toBeGreaterThan(0);
    expect(started.blobOpens()).toBe(0);
  });

  it("counts one blob where two assets name it, and sums both assets", async () => {
    const started = pool();
    const same = bytes("identical bytes");
    await upload(started.pool, "one.png", same);
    const second = await upload(started.pool, "two.png", same);
    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: second.id }] }),
    );

    const recorded = await started.pool.storage.recorded();
    const measured = await started.pool.storage.measure();

    expect(recorded.assets).toEqual({
      count: 2,
      bytes: same.byteLength * 2,
      saved: same.byteLength,
    });
    expect(measured.blobs).toEqual({ count: 1, bytes: same.byteLength });
  });

  /**
   * The blob store holds the outputs routing records name as well as the blobs
   * assets do, so the difference between the registry's bytes and the store's
   * is not the saving and never was. The registry answers it alone.
   */
  it("says what identical bytes saved even where the store holds an output no asset names", async () => {
    const started = await delivering("# a thought\n");
    const same = bytes("identical bytes");
    await upload(started.pool, "one.png", same);
    const second = await upload(started.pool, "two.png", same);
    const captured = await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: second.id }] }),
    );
    if (captured.kind === "refused") throw new Error("capture refused");
    const routed = await started.pool.routing.route(
      (captured.value.item as Item).id,
      {
        destination: VAULT,
        capability: "create-note" as CapabilityName,
        arguments: {},
      },
    );
    if (routed.kind === "refused") throw new Error("route refused");

    const recorded = await started.pool.storage.recorded();
    const measured = await started.pool.storage.measure();

    expect(recorded.assets.saved).toBe(same.byteLength);
    expect(measured.blobs.count).toBe(2);
    expect(recorded.assets.bytes - measured.blobs.bytes).not.toBe(
      recorded.assets.saved,
    );
  });

  it("says what the mirror holds, a pair per item", async () => {
    const started = pool();
    await started.pool.capture(envelope({ text: "a thought" }));
    await drainWith(started)();

    const mirror = (await started.pool.storage.measure()).mirror;

    expect(mirror).toMatchObject({ records: 1, files: 2 });
    expect(mirror?.bytes).toBeGreaterThan(0);
  });
});

describe("the figure a person is shown and the reclaim they fire", () => {
  /**
   * The whole of decision 4, over the drivers a host wires: nothing else in the
   * suite would notice the figure and the operation drifting apart.
   */
  it("take exactly the same blobs", async () => {
    const started = pool(IMPATIENT);
    const keptBytes = bytes("bytes an item names");
    const kept = await upload(started.pool, "kept.png", keptBytes);
    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: kept.id }] }),
    );

    const orphanBytes = bytes("bytes no item ever named");
    await upload(started.pool, "orphan.png", orphanBytes);
    started.clock.set("2026-08-06T09:00:01.000Z");
    await started.pool.maintenance.sweepUnreferencedAssets();
    await backdate(started.assetRoot);

    const measured = await started.pool.storage.measure();
    expect(measured.blobs).toEqual({
      count: 2,
      bytes: keptBytes.byteLength + orphanBytes.byteLength,
    });
    expect(measured.reclaimable).toEqual({
      count: 1,
      bytes: orphanBytes.byteLength,
    });

    expect(await started.pool.maintenance.reclaimUnnamedBlobs()).toEqual({
      blobs: measured.reclaimable.count,
      bytes: measured.reclaimable.bytes,
    });

    expect(await started.pool.storage.measure()).toMatchObject({
      blobs: { count: 1, bytes: keptBytes.byteLength },
      reclaimable: { count: 0, bytes: 0 },
    });
  });

  /** Its file is the wall clock's, which the frozen pool clock is months behind. */
  it("leaves a blob still inside the grace window, in the other figure", async () => {
    const started = pool(IMPATIENT);
    const orphanBytes = bytes("released, but the bytes were just put");
    await upload(started.pool, "orphan.png", orphanBytes);
    started.clock.set("2026-08-06T09:00:01.000Z");
    await started.pool.maintenance.sweepUnreferencedAssets();

    const measured = await started.pool.storage.measure();

    expect(measured.withinGrace).toEqual({
      count: 1,
      bytes: orphanBytes.byteLength,
    });
    expect(measured.reclaimable).toEqual({ count: 0, bytes: 0 });
    expect(await started.pool.maintenance.reclaimUnnamedBlobs()).toEqual({
      blobs: 0,
      bytes: 0,
    });
  });
});
