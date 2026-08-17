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
import { renderAsJson, type Renderers } from "./renderers";
import { insertUnder } from "./sections";

export type FilesystemDestinationConfig = {
  readonly id: DestinationId;
  /**
   * The directory the destination *is*. Never created: a root that is not there
   * is a drive that is not mounted far more often than it is a typo, and this
   * adapter does not conjure somebody's vault.
   */
  readonly root: string;
  /** The payload types both capabilities accept. Every type has a rendering. */
  readonly accepts: readonly PayloadTypeName[];
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
};

/**
 * Errnos that say the destination was not reachable rather than that the
 * delivery was wrong. A permission bit wrongly retried is bounded by
 * `maxAttempts` and ends up abandoned in front of a person, which is where it
 * was going anyway; an unmounted drive wrongly abandoned throws away a decision.
 * Only one of the two mistakes corrects itself.
 */
const UNREACHABLE: readonly string[] = [
  "EACCES",
  "EPERM",
  "EROFS",
  "ENOSPC",
  "EIO",
];

/** What the adapter itself decided, as opposed to what the filesystem said. */
class Refused extends Error {}

export function createFilesystemDestination(
  config: FilesystemDestinationConfig,
): DestinationAdapter {
  const renderers = config.renderers ?? {};

  const descriptor = {
    id: config.id,
    capabilities: capabilitiesFor(config.accepts),
  };

  return {
    describe: () => descriptor,

    deliver: async (delivery, signal): Promise<DeliveryOutcome> => {
      let realRoot: string;
      try {
        realRoot = await realRootOf(config.root);
        if (!(await stat(realRoot)).isDirectory()) {
          return unreachable(`${config.root} is not a directory`);
        }
      } catch (cause) {
        return unreachable(`${config.root}: ${why(cause)}`);
      }

      try {
        const landed = await carryOut(
          { realRoot, renderers },
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

/**
 * A note that is already there is refused before an asset is written, which is
 * the case that actually happens and costs the vault nothing. The link that
 * finally creates the file is what guarantees nothing is replaced; if it loses
 * a race, the assets beside it stay — debris, in exchange for never
 * overwriting.
 */
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

/**
 * **Not atomic against a concurrent editor.** One writer per file is the
 * standing rule and this adapter is it, but a person with the vault open is
 * outside that promise: their unsaved buffer will overwrite this on save.
 */
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
  at: { directory: string; assets: ReadonlyMap<string, string> },
): { frontmatter: string; body: string } {
  const renderer = renderers[delivery.payload.type] ?? renderAsJson;

  let rendered;
  try {
    rendered = renderer(delivery, at);
  } catch (cause) {
    // It will throw identically on every attempt, so retrying is pointless.
    throw new Refused(
      `the renderer for ${delivery.payload.type} threw: ${why(cause)}`,
    );
  }

  const entries = new Map<string, FrontmatterValue>(fixedFrontmatter(delivery));
  for (const [key, value] of rendered.frontmatter ?? []) {
    if (!FIXED_KEYS.includes(key)) entries.set(key, value);
  }

  return { frontmatter: toYaml(entries), body: rendered.body };
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
