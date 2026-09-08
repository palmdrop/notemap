import { describe, expect, it } from "vitest";

import type {
  Asset,
  AssetId,
  BlobHash,
  CapabilityName,
  DeliveredAsset,
  Delivery,
  DestinationId,
  ItemId,
  PayloadTypeName,
  SourceId,
  Timestamp,
} from "@notemap/core";

import { destinationRenderers } from "./renderers";

const NOTE = "note" as PayloadTypeName;

function asset(id: string, filename: string, mime: string): Asset {
  return {
    id: id as AssetId,
    filename,
    mime,
    blob: "blob-abc" as BlobHash,
    bytes: 8,
  };
}

function delivery(
  content: Record<string, unknown>,
  attached: readonly { slot: string; asset: Asset }[],
): Delivery {
  return {
    item: "item-1" as ItemId,
    destination: "vault" as DestinationId,
    capability: "create" as CapabilityName,
    arguments: {},
    source: "web-manual" as SourceId,
    payload: {
      type: NOTE,
      content: content as never,
      metadata: {},
      assets: attached.map((each) => ({
        slot: each.slot,
        asset: each.asset.id,
      })),
    },
    tags: [],
    createdAt: "2026-09-07T09:00:00.000Z" as Timestamp,
    artifacts: [],
    assets: attached.map((each): DeliveredAsset => ({
      slot: each.slot,
      asset: each.asset,
      open: () => {
        throw new Error("a rendering reads no bytes");
      },
    })),
  };
}

/** What the adapter called the copies it wrote, which is not what they were uploaded as. */
function landedAs(...names: readonly string[]): ReadonlyMap<string, string> {
  return new Map(
    names.map((name, index) => [String(index).padStart(3, "0"), name]),
  );
}

function render(
  content: Record<string, unknown>,
  attached: readonly { slot: string; asset: Asset }[],
  assets: ReadonlyMap<string, string> = new Map(),
): string {
  const renderer = destinationRenderers()[NOTE];
  if (renderer === undefined) throw new Error("no renderer for a note");
  return renderer(delivery(content, attached), { directory: "", assets }).body;
}

describe("rendering a note for a destination", () => {
  it("writes its prose as itself", () => {
    expect(render({ text: "a thought" }, [])).toBe("a thought\n");
  });

  it("writes its attachments in slot order, then its prose", () => {
    const body = render(
      { text: "before anyone rubbed it out" },
      [
        { slot: "001", asset: asset("a2", "later.png", "image/png") },
        { slot: "000", asset: asset("a1", "first.png", "image/png") },
      ],
      landedAs("first.png", "later.png"),
    );

    expect(body).toBe(
      "![first.png](first.png)\n![later.png](later.png)\n\nbefore anyone rubbed it out\n",
    );
  });

  it("links an attachment that is not a picture rather than embedding it", () => {
    const body = render(
      {},
      [{ slot: "000", asset: asset("a1", "interview.opus", "audio/opus") }],
      landedAs("interview.opus"),
    );

    expect(body).toBe("[interview.opus](interview.opus)\n");
  });

  it("draws nothing for an attachment the destination did not carry", () => {
    const body = render({ text: "a thought" }, [
      { slot: "000", asset: asset("a1", "photo.png", "image/png") },
    ]);

    expect(body).toBe("a thought\n");
  });
});
