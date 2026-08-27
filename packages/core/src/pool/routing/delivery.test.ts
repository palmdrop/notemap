import { describe, expect, it } from "vitest";

import type { PoolPorts } from "#types/api/ports";
import type { Asset } from "#types/domain/asset";
import type { Artifact } from "#types/domain/enrichment";
import type {
  AssetId,
  BlobHash,
  CapabilityName,
  DestinationId,
  ItemId,
  SourceId,
  Timestamp,
} from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { DeliveryRequest } from "#types/domain/routing";

import { asDeliveryWorkOutcome, projectDelivery } from "./delivery";

const REQUEST: DeliveryRequest = {
  destination: "vault" as DestinationId,
  capability: "create-note" as CapabilityName,
  target: { path: "inbox/a.md" },
};

function asset(id: string, filename = `${id}.png`): Asset {
  return {
    id: id as AssetId,
    filename,
    mime: "image/png",
    blob: `blob-${id}` as BlobHash,
    bytes: 4,
  };
}

function item(assets: readonly { slot: string; asset: string }[] = []): Item {
  return {
    id: "item-1" as ItemId,
    source: "clipper" as SourceId,
    sourceItemId: "one",
    payload: {
      type: "note" as Item["payload"]["type"],
      content: { body: "a thought" },
      metadata: {},
      assets: assets.map((each) => ({
        slot: each.slot,
        asset: each.asset as AssetId,
      })),
    },
    tags: [],
    createdAt: "2026-08-06T09:00:00.000Z" as Timestamp,
    modifiedAt: "2026-08-06T09:00:00.000Z" as Timestamp,
    revisedInto: [],
  };
}

function artifact(
  assets: readonly { slot: string; asset: string }[],
): Artifact {
  return {
    id: "artifact-1" as Artifact["id"],
    item: "item-1" as ItemId,
    enrichment: "transcribe" as Artifact["enrichment"],
    by: { kind: "notemap" },
    createdAt: "2026-08-06T09:01:00.000Z" as Timestamp,
    content: {},
    assets: assets.map((each) => ({
      slot: each.slot,
      asset: each.asset as AssetId,
    })),
  };
}

/**
 * `projectDelivery` reaches for three things and nothing else, so the rest of
 * `PoolPorts` stays unbuilt rather than stubbed into existence.
 */
function ports(options: {
  assets?: readonly Asset[];
  artifacts?: readonly Artifact[];
  bytes?: (blob: BlobHash) => AsyncIterable<Uint8Array> | undefined;
}): PoolPorts & { opened: readonly BlobHash[] } {
  const known = new Map(
    (options.assets ?? []).map((each) => [each.id as string, each]),
  );
  const opened: BlobHash[] = [];

  return {
    opened,
    store: {
      artifacts: async () => options.artifacts ?? [],
      asset: async (id: AssetId) => known.get(id),
    },
    blobs: {
      open: async (blob: BlobHash) => {
        opened.push(blob);
        return options.bytes === undefined
          ? stream(new Uint8Array([1, 2, 3, 4]))
          : options.bytes(blob);
      },
    },
  } as unknown as PoolPorts & { opened: readonly BlobHash[] };
}

async function* stream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

describe("what an attempt's outcome becomes for the queue", () => {
  it("carries a pointer where the destination reported one", () => {
    expect(
      asDeliveryWorkOutcome({
        kind: "delivered",
        pointer: "vault/inbox/a.md",
      }),
    ).toEqual({ kind: "delivered", pointer: "vault/inbox/a.md" });
  });

  it("omits the pointer rather than carrying an absent one", () => {
    expect(
      asDeliveryWorkOutcome({
        kind: "delivered",
      }),
    ).toEqual({ kind: "delivered" });
  });

  /** The evidence rule, in the one place a host's report turns into a retry or a refusal. */
  it("retries what was never reached and abandons what refused", () => {
    expect(
      asDeliveryWorkOutcome({ kind: "unreachable", detail: "ECONNREFUSED" }),
    ).toEqual({
      kind: "failed",
      retryable: true,
      detail: { code: "unreachable", detail: "ECONNREFUSED" },
    });

    expect(
      asDeliveryWorkOutcome({ kind: "rejected", detail: "no such folder" }),
    ).toEqual({
      kind: "failed",
      retryable: false,
      detail: { code: "rejected-by-destination", detail: "no such folder" },
    });
  });
});

describe("the assets a projected delivery gathers", () => {
  it("takes an artifact's references beside the payload's", async () => {
    const wired = ports({
      assets: [asset("a"), asset("b")],
      artifacts: [artifact([{ slot: "transcript", asset: "b" }])],
    });

    const delivery = await projectDelivery(
      wired,
      item([{ slot: "photo", asset: "a" }]),
      REQUEST,
    );

    expect(delivery.assets.map((each) => [each.slot, each.asset.id])).toEqual([
      ["photo", "a"],
      ["transcript", "b"],
    ]);
  });

  /** An artifact naming what the payload already named is one asset, not two uploads. */
  it("hands over one asset where both reference the same slot", async () => {
    const wired = ports({
      assets: [asset("a")],
      artifacts: [artifact([{ slot: "photo", asset: "a" }])],
    });

    const delivery = await projectDelivery(
      wired,
      item([{ slot: "photo", asset: "a" }]),
      REQUEST,
    );

    expect(delivery.assets).toHaveLength(1);
  });

  it("keeps one asset filling two slots as two, since each slot is a place it goes", async () => {
    const wired = ports({
      assets: [asset("a")],
      artifacts: [artifact([{ slot: "thumbnail", asset: "a" }])],
    });

    const delivery = await projectDelivery(
      wired,
      item([{ slot: "photo", asset: "a" }]),
      REQUEST,
    );

    expect(delivery.assets.map((each) => each.slot)).toEqual([
      "photo",
      "thumbnail",
    ]);
  });

  it("orders by slot, then by asset, so a destination sees the same sequence twice running", async () => {
    const wired = ports({
      assets: [asset("b"), asset("a"), asset("c")],
      artifacts: [],
    });

    const delivery = await projectDelivery(
      wired,
      item([
        { slot: "photo", asset: "b" },
        { slot: "audio", asset: "c" },
        { slot: "photo", asset: "a" },
      ]),
      REQUEST,
    );

    expect(delivery.assets.map((each) => [each.slot, each.asset.id])).toEqual([
      ["audio", "c"],
      ["photo", "a"],
      ["photo", "b"],
    ]);
  });

  it("drops a reference nothing resolves, rather than handing over half an asset", async () => {
    const wired = ports({
      assets: [asset("a")],
      artifacts: [],
    });

    const delivery = await projectDelivery(
      wired,
      item([
        { slot: "photo", asset: "a" },
        { slot: "ghost", asset: "gone" },
      ]),
      REQUEST,
    );

    expect(delivery.assets.map((each) => each.asset.id)).toEqual(["a"]);
  });
});

describe("when a delivery reads the bytes", () => {
  it("opens nothing until the adapter asks", async () => {
    const wired = ports({ assets: [asset("a")], artifacts: [] });

    const delivery = await projectDelivery(
      wired,
      item([{ slot: "photo", asset: "a" }]),
      REQUEST,
    );

    expect(wired.opened).toEqual([]);

    await delivery.assets[0]?.open();
    expect(wired.opened).toEqual(["blob-a"]);
  });

  /** An asset row whose blob has gone is a broken pool, not an empty delivery. */
  it("throws rather than answering an empty stream when the bytes are gone", async () => {
    const wired = ports({
      assets: [asset("a", "café.png")],
      artifacts: [],
      bytes: () => undefined,
    });

    const delivery = await projectDelivery(
      wired,
      item([{ slot: "photo", asset: "a" }]),
      REQUEST,
    );

    await expect(delivery.assets[0]?.open()).rejects.toThrow(
      /café\.png.*blob-a/,
    );
  });
});
