import { createHash } from "node:crypto";

import type { Delivery } from "@notemap/core";
import {
  asPlaceAssetsArguments,
  attachedAssets,
  placements,
  type Occupant,
  type Placement,
} from "@notemap/output-markdown";

import type { Dav } from "./dav";
import { Refused, Unreachable } from "./errors";
import { contain, encodePath, type Contained } from "./paths";

/** Where a capture's attachments would land, worked out without writing any of them. */
export type Placing = {
  readonly folder: Contained;
  readonly placed: readonly Placement[];
};

export async function composePlacing(
  dav: Dav,
  root: string,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Placing> {
  const args = asPlaceAssetsArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a place-assets argument set");
  }

  const assets = attachedAssets(delivery);
  if (assets.length === 0) {
    throw new Refused("this capture has no attachments to place");
  }

  const contained = contain(root, args.directory);
  if (contained.kind === "refused") throw new Refused(contained.detail);

  const folder = contained.path;
  const placed = await placements(assets, (name) =>
    occupantOf(dav, childOf(folder, name), signal),
  );
  return { folder, placed };
}

/**
 * The folder `require` asked for, where it is not there. Refused is the server
 * declining to answer rather than the folder being gone, so it is retried.
 */
export async function requirePlacingFolder(
  dav: Dav,
  placing: Placing,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<void> {
  if (asPlaceAssetsArguments(delivery.arguments)?.folder !== "require") return;

  const looked = await dav.look(placing.folder.encoded, signal);
  if (looked.kind === "there" && looked.collection) return;
  if (looked.kind === "refused") {
    throw new Unreachable(
      `the account refused to say whether ${placing.folder.relative}/ is there (${String(looked.status)})`,
    );
  }

  throw new Refused(
    placing.folder.relative === ""
      ? "the destination's own folder is missing"
      : `${placing.folder.relative}/ is missing`,
  );
}

/** Every collection from below the root down to the folder itself, which a `PUT` will not make. */
export async function makePlacingFolder(
  dav: Dav,
  placing: Placing,
  signal?: AbortSignal,
): Promise<void> {
  const { segments, rootDepth } = placing.folder;
  for (let depth = rootDepth + 1; depth <= segments.length; depth += 1) {
    await dav.makeCollection(encodePath(segments.slice(0, depth)), signal);
  }
}

export async function carryOutPlacing(
  dav: Dav,
  placing: Placing,
  signal?: AbortSignal,
): Promise<void> {
  const written = new Set<string>();

  for (const each of placing.placed) {
    if (each.there || written.has(each.name)) continue;
    written.add(each.name);

    const created = await dav.create(
      childOf(placing.folder, each.name),
      await each.asset.open(signal),
      signal,
    );
    if (created === "condition-failed") {
      throw new Refused(
        `${each.name} appeared while the attachments were being placed`,
      );
    }
  }
}

function childOf(folder: Contained, name: string): string {
  return encodePath([...folder.segments, name]);
}

async function occupantOf(
  dav: Dav,
  path: string,
  signal?: AbortSignal,
): Promise<Occupant> {
  const looked = await dav.look(path, signal);

  switch (looked.kind) {
    case "not-there":
      return { kind: "free" };
    case "refused":
      throw new Unreachable(
        `the account refused to say what ${decodeURIComponent(path)} holds (${String(looked.status)})`,
      );
    case "there":
      if (looked.collection) return { kind: "other" };
      return {
        kind: "file",
        ...(looked.bytes === undefined ? {} : { bytes: looked.bytes }),
        digest: () => digestOf(dav, path, signal),
      };
  }
}

/** A file gone between the look and the read holds nothing these bytes could match. */
async function digestOf(
  dav: Dav,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = await dav.read(path, signal);
  if (body === undefined) return "";

  const digest = createHash("sha256");
  for await (const chunk of body) digest.update(chunk);
  return digest.digest("hex");
}
