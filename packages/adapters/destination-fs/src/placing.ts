import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, stat } from "node:fs/promises";
import { join } from "node:path";

import type { Delivery } from "@notemap/core";
import {
  asPlaceAssetsArguments,
  attachedAssets,
  placements,
  type Occupant,
  type Placement,
  type Walking,
} from "@notemap/output-markdown";

import { createFile } from "./atomic";
import { Contended, Refused } from "./errors";
import { contain, type Contained } from "./paths";

/** Where a capture's attachments would land, worked out without writing any of them. */
export type Placing = {
  readonly folder: Contained;
  readonly placed: readonly Placement[];
};

export async function composePlacing(
  realRoot: string,
  delivery: Delivery,
  walking: Walking,
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

  const contained = await contain(realRoot, args.directory);
  if (contained.kind === "refused") throw new Refused(contained.detail);

  const folder = contained.path;
  const placed = await placements(
    assets,
    (name) => occupantOf(join(folder.absolute, name), signal),
    walking,
  );
  return { folder, placed };
}

/** The folder `require` asked for, where it is not there. */
export async function placingFolderMissing(
  placing: Placing,
  delivery: Delivery,
): Promise<string | undefined> {
  if (asPlaceAssetsArguments(delivery.arguments)?.folder !== "require") {
    return undefined;
  }

  try {
    if ((await stat(placing.folder.absolute)).isDirectory()) return undefined;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
  }

  return placing.folder.relative === ""
    ? "the destination's own folder"
    : `${placing.folder.relative}/`;
}

export async function carryOutPlacing(
  placing: Placing,
  signal?: AbortSignal,
): Promise<void> {
  const written = new Set<string>();

  for (const each of placing.placed) {
    if (each.there || written.has(each.name)) continue;
    written.add(each.name);

    try {
      await createFile(
        join(placing.folder.absolute, each.name),
        await each.asset.open(signal),
      );
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      throw new Contended(
        `${each.name} appeared while the attachments were being placed`,
        { cause },
      );
    }
  }
}

/**
 * Not followed through a link: what a link points at may be outside the root,
 * and reading it to compare would be reading somewhere this destination is not.
 */
async function occupantOf(
  path: string,
  signal?: AbortSignal,
): Promise<Occupant> {
  let found;
  try {
    found = await lstat(path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "free" };
    }
    throw cause;
  }

  if (!found.isFile()) return { kind: "other" };
  return {
    kind: "file",
    bytes: found.size,
    digest: () => digestOf(path, signal),
  };
}

async function digestOf(
  path: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const digest = createHash("sha256");
  try {
    for await (const chunk of createReadStream(
      path,
      signal ? { signal } : {},
    )) {
      digest.update(chunk as Buffer);
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
  return digest.digest("hex");
}
