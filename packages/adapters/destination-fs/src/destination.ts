import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  Delivery,
  DeliveryOutcome,
  DestinationAdapter,
  DestinationId,
  PayloadTypeName,
} from "@notemap/core";

import { placeAssets } from "./assets";
import { createFile, replaceFile } from "./atomic";
import { Refused } from "./errors";
import {
  APPEND_TO_FILE,
  asAppendToFileTarget,
  asCreateFileTarget,
  CREATE_FILE,
  capabilitiesFor,
} from "./capabilities";
import { deriveFilename } from "./filename";
import { FIXED_KEYS, fixedFrontmatter, toYaml } from "./frontmatter";
import type { FrontmatterValue } from "./frontmatter";
import { contain, realRootOf, type Contained } from "./paths";
import {
  renderAsJson,
  type Renderers,
  type Rendering,
  type RenderingContext,
} from "./renderers";
import { insertUnder } from "./sections";

export type FilesystemDestinationConfig = {
  readonly id: DestinationId;
  /** The directory the destination *is*. Never created. */
  readonly root: string;
  readonly accepts: readonly PayloadTypeName[];
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
};

const UNREACHABLE: readonly string[] = [
  "EACCES",
  "EPERM",
  "EROFS",
  "ENOSPC",
  "EIO",
];

export function createFilesystemDestination(
  config: FilesystemDestinationConfig,
): DestinationAdapter {
  const renderers = config.renderers ?? {};

  const descriptor = {
    id: config.id,
    capabilities: capabilitiesFor(config.accepts),
  };

  return {
    id: config.id,
    describe: () => Promise.resolve(descriptor),

    deliver: async (delivery, signal): Promise<DeliveryOutcome> => {
      const reached = await reachRoot(config.root);
      if (typeof reached !== "string") return reached;

      try {
        const landed = await carryOut(
          { realRoot: reached, renderers },
          delivery,
          signal,
        );
        return { kind: "delivered", pointer: landed };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}

/** The root as the filesystem holds it, or why it could not be reached. */
async function reachRoot(root: string): Promise<string | DeliveryOutcome> {
  try {
    const realRoot = await realRootOf(root);
    return (await stat(realRoot)).isDirectory()
      ? realRoot
      : unreachable(`${root} is not a directory`);
  } catch (cause) {
    return unreachable(`${root}: ${why(cause)}`);
  }
}

type Wiring = {
  readonly realRoot: string;
  readonly renderers: Renderers;
};

function carryOut(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  switch (delivery.capability) {
    case CREATE_FILE:
      return createNote(wiring, delivery, signal);
    case APPEND_TO_FILE:
      return appendToNote(wiring, delivery, signal);
    default:
      throw new Refused(`no capability named ${delivery.capability}`);
  }
}

/** An asset written before a `link` that then loses a race is left as debris, in exchange for never overwriting. */
async function createNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  const target = asCreateFileTarget(delivery.target);
  if (target === undefined) {
    throw new Refused("that is not a create-file target");
  }

  const filename = target.filename ?? deriveFilename(delivery);
  const note = await locate(wiring.realRoot, join(target.directory, filename));

  if (await exists(note.absolute)) {
    throw new Refused(`${note.relative} is already there`);
  }

  const directory = dirname(note.absolute);
  const assets = await placeAssets(directory, delivery.assets, signal);
  const rendered = render(wiring.renderers, delivery, { directory, assets });

  await createFile(note.absolute, `${rendered.frontmatter}\n${rendered.body}`);
  return note.relative;
}

/** **Not atomic against a concurrent editor**: an open editor's buffer will overwrite this on save. */
async function appendToNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  const target = asAppendToFileTarget(delivery.target);
  if (target === undefined) {
    throw new Refused("that is not an append-to-file target");
  }

  const note = await locate(wiring.realRoot, target.path);
  const directory = dirname(note.absolute);

  const assets = await placeAssets(directory, delivery.assets, signal);
  const rendered = render(wiring.renderers, delivery, { directory, assets });

  const existing = await readIfPresent(note.absolute);
  if (existing === undefined) {
    await createFile(
      note.absolute,
      `${rendered.frontmatter}\n${insertUnder("", rendered.body, target.heading)}`,
    );
  } else {
    await replaceFile(
      note.absolute,
      insertUnder(existing, rendered.body, target.heading),
    );
  }

  return note.relative;
}

/** A file inside the root, or a refusal that names what was wrong with the path. */
async function locate(realRoot: string, target: string): Promise<Contained> {
  const contained = await contain(realRoot, target);
  if (contained.kind === "refused") throw new Refused(contained.detail);
  if (contained.path.relative === "") {
    throw new Refused(`${target} names the destination itself`);
  }
  return contained.path;
}

function render(
  renderers: Renderers,
  delivery: Delivery,
  at: RenderingContext,
): { frontmatter: string; body: string } {
  const rendered = renderOrRefuse(renderers, delivery, at);

  const entries = new Map<string, FrontmatterValue>(fixedFrontmatter(delivery));
  for (const [key, value] of rendered.frontmatter ?? []) {
    if (!FIXED_KEYS.includes(key)) entries.set(key, value);
  }

  return { frontmatter: toYaml(entries), body: rendered.body };
}

function renderOrRefuse(
  renderers: Renderers,
  delivery: Delivery,
  at: RenderingContext,
): Rendering {
  const renderer = renderers[delivery.payload.type] ?? renderAsJson;
  try {
    return renderer(delivery, at);
  } catch (cause) {
    // It will throw identically on every attempt, so retrying is pointless.
    throw new Refused(
      `the renderer for ${delivery.payload.type} threw: ${why(cause)}`,
    );
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

function unreachable(detail: string): DeliveryOutcome {
  return { kind: "unreachable", detail };
}

/**
 * What a throw from the middle of a delivery means. Anything about the *target*
 * — a traversal, a file that is already there — is `rejected`, which is
 * abandoned on the first attempt, because retrying cannot change it.
 */
function failure(cause: unknown): DeliveryOutcome {
  if (cause instanceof Refused) return { kind: "rejected", detail: why(cause) };

  const code = (cause as NodeJS.ErrnoException).code;
  return code !== undefined && UNREACHABLE.includes(code)
    ? unreachable(why(cause))
    : { kind: "rejected", detail: why(cause) };
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
