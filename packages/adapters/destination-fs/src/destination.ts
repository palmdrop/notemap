import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  Delivery,
  DeliveryOutcome,
  Destination,
  DestinationKindAdapter,
  PayloadTypeName,
} from "@notemap/core";

import { placeAssets } from "./assets";
import { createFile, replaceFile } from "./atomic";
import { Refused } from "./errors";
import {
  APPEND_TO_FILE,
  asAppendToFileArguments,
  asCreateFileArguments,
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
import {
  asFilesystemSettings,
  FILESYSTEM,
  FILESYSTEM_SETTINGS,
} from "./settings";
import { insertUnder } from "./sections";

/** What the host wires: neither a renderer nor the payload types that exist is a person's setting. */
export type FilesystemDestinationConfig = {
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
  /** What every destination of this kind takes. */
  readonly accepts: readonly PayloadTypeName[];
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
): DestinationKindAdapter {
  const renderers = config.renderers ?? {};

  return {
    name: FILESYSTEM,
    settingsSchema: FILESYSTEM_SETTINGS,

    /**
     * Never looks at the filesystem: an unmounted root is something a delivery
     * discovers and retries past, and refusing to describe it would turn a
     * decision worth reserving into one that cannot be made at all.
     */
    describe: (destination) => {
      const settings = asFilesystemSettings(destination.settings);
      return settings === undefined
        ? Promise.reject(unreadable(destination))
        : Promise.resolve({
            capabilities: capabilitiesFor(config.accepts),
          });
    },

    deliver: async (
      destination,
      delivery,
      signal,
    ): Promise<DeliveryOutcome> => {
      const settings = asFilesystemSettings(destination.settings);
      if (settings === undefined) {
        return { kind: "rejected", detail: why(unreadable(destination)) };
      }

      const reached = await reachRoot(settings.root);
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

/** Core checks settings against the schema first, so this is the two disagreeing. */
function unreadable(destination: Destination): Error {
  return new Error(`${destination.name} has no readable filesystem settings`);
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
  const args = asCreateFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-file argument set");
  }

  const filename = args.filename ?? deriveFilename(delivery);
  const note = await locate(wiring.realRoot, join(args.directory, filename));

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
  const args = asAppendToFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not an append-to-file argument set");
  }

  const note = await locate(wiring.realRoot, args.path);
  const directory = dirname(note.absolute);

  const assets = await placeAssets(directory, delivery.assets, signal);
  const rendered = render(wiring.renderers, delivery, { directory, assets });

  const existing = await readIfPresent(note.absolute);
  if (existing === undefined) {
    await createFile(
      note.absolute,
      `${rendered.frontmatter}\n${insertUnder("", rendered.body, args.heading)}`,
    );
  } else {
    await replaceFile(
      note.absolute,
      insertUnder(existing, rendered.body, args.heading),
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
