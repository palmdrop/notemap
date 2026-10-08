import { describe, expect, it } from "vitest";

import type {
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

import {
  attachedAssets,
  folderPointer,
  placedOutput,
  placements,
  type Occupant,
} from "./placing";

const PAPER = "a".repeat(64);
const OTHER = "b".repeat(64);

function asset(
  slot: string,
  filename: string,
  blob = PAPER,
  bytes = 10,
): DeliveredAsset {
  return {
    slot,
    asset: {
      id: `asset-${slot}` as AssetId,
      filename,
      mime: "application/pdf",
      blob: blob as BlobHash,
      bytes,
    },
    open: () => Promise.reject(new Error("never opened")),
  };
}

/** A folder holding these names, each with its bytes and digest. */
function folder(
  held: Record<string, { blob: string; bytes?: number } | "folder">,
) {
  const digested: string[] = [];
  const occupant = (name: string): Promise<Occupant> => {
    const one = held[name];
    if (one === undefined) return Promise.resolve({ kind: "free" });
    if (one === "folder") return Promise.resolve({ kind: "other" });
    return Promise.resolve({
      kind: "file",
      ...(one.bytes === undefined ? {} : { bytes: one.bytes }),
      digest: () => {
        digested.push(name);
        return Promise.resolve(one.blob);
      },
    });
  };
  return { occupant, digested };
}

describe("where each attachment lands", () => {
  it("keeps the uploaded name where it is free", async () => {
    const placed = await placements(
      [asset("000", "paper.pdf")],
      folder({}).occupant,
    );
    expect(placed.map((each) => [each.name, each.there])).toEqual([
      ["paper.pdf", false],
    ]);
  });

  it("is already there where the name holds these bytes", async () => {
    const placed = await placements(
      [asset("000", "paper.pdf")],
      folder({ "paper.pdf": { blob: PAPER, bytes: 10 } }).occupant,
    );
    expect(placed.map((each) => [each.name, each.there])).toEqual([
      ["paper.pdf", true],
    ]);
  });

  it("numbers past a name holding different bytes, keeping the extension", async () => {
    const placed = await placements(
      [asset("000", "paper.pdf")],
      folder({
        "paper.pdf": { blob: OTHER, bytes: 10 },
        "paper-1.pdf": { blob: OTHER, bytes: 10 },
      }).occupant,
    );
    expect(placed.map((each) => each.name)).toEqual(["paper-2.pdf"]);
  });

  /** A retry after the first attempt wrote `paper-1.pdf` lands on it rather than on `paper-2.pdf`. */
  it("stops at the copy an earlier attempt wrote further down the chain", async () => {
    const placed = await placements(
      [asset("000", "paper.pdf")],
      folder({
        "paper.pdf": { blob: OTHER, bytes: 10 },
        "paper-1.pdf": { blob: PAPER, bytes: 10 },
      }).occupant,
    );
    expect(placed.map((each) => [each.name, each.there])).toEqual([
      ["paper-1.pdf", true],
    ]);
  });

  it("reads a file in full only where its size matches", async () => {
    const { occupant, digested } = folder({
      "paper.pdf": { blob: OTHER, bytes: 99 },
      "paper-1.pdf": { blob: OTHER },
    });
    await placements([asset("000", "paper.pdf")], occupant);
    expect(digested).toEqual(["paper-1.pdf"]);
  });

  it("walks past a folder of the same name", async () => {
    const placed = await placements(
      [asset("000", "scans")],
      folder({ scans: "folder" }).occupant,
    );
    expect(placed.map((each) => each.name)).toEqual(["scans-1"]);
  });

  it("gives two attachments of one name two files", async () => {
    const placed = await placements(
      [asset("000", "scan.pdf"), asset("001", "scan.pdf", OTHER)],
      folder({}).occupant,
    );
    expect(placed.map((each) => each.name)).toEqual(["scan.pdf", "scan-1.pdf"]);
  });

  it("writes the same bytes attached twice under one name once", async () => {
    const placed = await placements(
      [asset("000", "scan.pdf"), asset("001", "scan.pdf")],
      folder({}).occupant,
    );
    expect(placed.map((each) => [each.name, each.there])).toEqual([
      ["scan.pdf", false],
      ["scan.pdf", false],
    ]);
  });

  it("flattens a name that was never a name", async () => {
    const placed = await placements(
      [asset("000", "../../authorized_keys")],
      folder({}).occupant,
    );
    expect(placed.map((each) => each.name)).toEqual(["authorized_keys"]);
  });
});

describe("what a placement says", () => {
  it("lists every path once, and names those already there", async () => {
    const placed = await placements(
      [
        asset("000", "paper.pdf"),
        asset("001", "scan.pdf", OTHER),
        asset("002", "paper.pdf"),
      ],
      folder({ "scan.pdf": { blob: OTHER, bytes: 10 } }).occupant,
    );
    const output = placedOutput(placed, "library");

    const chunks: Uint8Array[] = [];
    const content = output.content;
    if (content === undefined) throw new Error("no content");
    for await (const chunk of await content.open()) chunks.push(chunk);

    expect(content.mediaType).toBe("text/plain");
    expect(new TextDecoder().decode(Buffer.concat(chunks))).toBe(
      "library/paper.pdf\nlibrary/scan.pdf\n",
    );
    expect(output.note).toBe("already there: library/scan.pdf");
  });

  it("names the folder as the pointer, and nothing at the root", () => {
    expect(folderPointer("library/papers")).toBe("library/papers/");
    expect(folderPointer("")).toBeUndefined();
  });
});

describe("which assets are the attachments", () => {
  it("leaves out an asset only an artifact references", () => {
    const attached = asset("000", "paper.pdf");
    const transcript = asset("100", "transcript.txt");
    const delivery: Delivery = {
      item: "item-1" as ItemId,
      destination: "vault" as DestinationId,
      capability: "place-assets" as CapabilityName,
      arguments: {},
      source: "web" as SourceId,
      payload: {
        type: "note" as PayloadTypeName,
        content: {},
        metadata: {},
        assets: [{ slot: "000", asset: attached.asset.id }],
      },
      tags: [],
      createdAt: "2026-10-08T09:00:00.000Z" as Timestamp,
      artifacts: [],
      assets: [attached, transcript],
    };

    expect(attachedAssets(delivery)).toEqual([attached]);
  });
});
