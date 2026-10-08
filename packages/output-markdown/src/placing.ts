import type { DeliveredAsset, DeliveredOutput, Delivery } from "@notemap/core";

import { oneSegment } from "./names";

/** What a name in the folder holds, as much as the walk has to know. */
export type Occupant =
  | { readonly kind: "free" }
  /** Something that can never be these bytes, such as a folder. */
  | { readonly kind: "other" }
  | {
      readonly kind: "file";
      /** Absent where the destination did not say. */
      readonly bytes?: number;
      /** The SHA-256 of what the file holds, in hex. */
      digest(): Promise<string>;
    };

export type Placement = {
  readonly asset: DeliveredAsset;
  readonly name: string;
  /** Already holding these bytes, so nothing is written. */
  readonly there: boolean;
};

/**
 * The payload's own assets, in slot order. An artifact may reference assets
 * too, and those are an enrichment's rather than anything a person attached.
 */
export function attachedAssets(delivery: Delivery): readonly DeliveredAsset[] {
  const attached = new Set(
    delivery.payload.assets.map((each) => `${each.slot}\u0000${each.asset}`),
  );
  return delivery.assets.filter((each) =>
    attached.has(`${each.slot}\u0000${each.asset.id}`),
  );
}

/**
 * Where each asset lands: the name it was uploaded with, or the first of
 * `stem-1.ext`, `stem-2.ext`, … that is free or already holds its bytes. A
 * retry walks the same chain and stops at the copy its last attempt wrote,
 * which is what keeps a retry from duplicating without a digest in the name.
 *
 * Assets earlier in the same delivery claim their names before anything is
 * written, so two attachments called `scan.pdf` land as two files.
 */
export async function placements(
  assets: readonly DeliveredAsset[],
  occupant: (name: string) => Promise<Occupant>,
): Promise<readonly Placement[]> {
  const claimed = new Map<string, Placement>();
  const placed: Placement[] = [];

  for (const asset of assets) {
    const wanted = oneSegment(asset.asset.filename, asset.asset.id);

    for (let step = 0; ; step += 1) {
      const name = numbered(wanted, step);

      const earlier = claimed.get(name);
      if (earlier !== undefined) {
        if (earlier.asset.asset.blob !== asset.asset.blob) continue;
        placed.push({ asset, name, there: earlier.there });
        break;
      }

      const held = await occupant(name);
      if (held.kind === "other") continue;

      const there = held.kind === "file";
      if (there && !(await holds(held, asset))) continue;

      const placement = { asset, name, there };
      claimed.set(name, placement);
      placed.push(placement);
      break;
    }
  }

  return placed;
}

/**
 * The paths that were placed, one a line, so the record says what went under
 * which name, and a note naming those already there.
 */
export function placedOutput(
  placed: readonly Placement[],
  directory: string,
): DeliveredOutput {
  const at = (name: string) => (directory === "" ? name : `${directory}/${name}`);
  const paths = [...new Set(placed.map((each) => at(each.name)))];
  const there = [
    ...new Set(placed.filter((each) => each.there).map((each) => at(each.name))),
  ];

  const written = new TextEncoder().encode(`${paths.join("\n")}\n`);
  return {
    content: {
      mediaType: "text/plain",
      open: () => Promise.resolve(once(written)),
    },
    ...(there.length === 0 ? {} : { note: `already there: ${there.join(", ")}` }),
  };
}

/** The folder as a pointer names it, which at the root is nothing. */
export function folderPointer(directory: string): string | undefined {
  return directory === "" ? undefined : `${directory}/`;
}

function numbered(name: string, step: number): string {
  if (step === 0) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)}-${step}${name.slice(dot)}`
    : `${name}-${step}`;
}

async function holds(
  held: Extract<Occupant, { kind: "file" }>,
  asset: DeliveredAsset,
): Promise<boolean> {
  if (held.bytes !== undefined && held.bytes !== asset.asset.bytes) {
    return false;
  }
  return (await held.digest()) === asset.asset.blob;
}

async function* once(written: Uint8Array): AsyncGenerator<Uint8Array> {
  yield written;
}
