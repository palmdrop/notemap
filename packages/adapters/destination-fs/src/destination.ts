import { access, constants, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  Rejected,
  Unusable,
  type Delivery,
  type DeliveryOutcome,
  type Destination,
  type DestinationKindAdapter,
  type PayloadTypeName,
} from "@notemap/core";

import {
  APPEND_TO_FILE,
  asAppendToFileArguments,
  asCreateFileArguments,
  asCreateOrAppendFileArguments,
  capabilitiesFor,
  CREATE_FILE,
  CREATE_OR_APPEND_FILE,
  deriveFilename,
  insertUnder,
  markdownOutput,
  placeOf,
  renderNote,
  RenderingFailed,
  type Renderers,
} from "@notemap/output-markdown";

import { placeAssets } from "./assets";
import { createFile, replaceFile } from "./atomic";
import { filesystemCandidates } from "./candidates";
import { Refused } from "./errors";
import { contain, overlapsAny, realRootOf, type Contained } from "./paths";
import {
  asFilesystemSettings,
  FILESYSTEM,
  FILESYSTEM_SETTINGS,
} from "./settings";

/** What the host wires: neither a renderer nor the payload types that exist is a person's setting. */
export type FilesystemDestinationConfig = {
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
  /** What every destination of this kind takes. */
  readonly accepts: readonly PayloadTypeName[];
  /**
   * The pool, the mirror and the assets — paths only the host knows are its
   * own. A root that contains one, or sits inside one, is refused: routing a
   * note into the mirror is destructive and nobody ever means it.
   */
  readonly reserved?: readonly string[];
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
  const reserved = config.reserved ?? [];

  return {
    name: FILESYSTEM,
    settingsSchema: FILESYSTEM_SETTINGS,

    /**
     * Never looks at the filesystem: an unmounted root is something a delivery
     * discovers and retries past, and refusing to describe it would turn a
     * decision worth reserving into one that cannot be made at all. The
     * overlap check is pure path arithmetic and costs nothing to run here too.
     */
    describe: (destination) => {
      const settings = asFilesystemSettings(destination.settings);
      if (settings === undefined)
        return Promise.reject(unreadable(destination));

      const overlap = overlapsAny(settings.root, reserved);
      if (overlap !== undefined) {
        return Promise.reject(
          new Unusable(overlapDetail(settings.root, overlap)),
        );
      }

      return Promise.resolve({
        capabilities: capabilitiesFor({
          accepts: config.accepts,
          browsable: true,
        }),
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

      const overlap = overlapsAny(reached, reserved);
      if (overlap !== undefined) {
        return { kind: "rejected", detail: overlapDetail(reached, overlap) };
      }

      try {
        const landed = await carryOut(
          { realRoot: reached, renderers },
          delivery,
          signal,
        );
        // No url, permanently: a path on the daemon's host is nowhere the
        // phone reading the shell can follow.
        return {
          kind: "delivered",
          pointer: landed.pointer,
          output: markdownOutput(landed.written),
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    candidates: (destination, request) =>
      filesystemCandidates({ reserved }, destination, request),

    probe: async (destination) => {
      const settings = asFilesystemSettings(destination.settings);
      if (settings === undefined) throw unreadable(destination);

      let realRoot: string;
      try {
        realRoot = await realRootOf(settings.root);
      } catch (cause) {
        throw unresolvable(settings.root, cause);
      }

      const overlap = overlapsAny(realRoot, reserved);
      if (overlap !== undefined) {
        throw new Unusable(overlapDetail(realRoot, overlap));
      }

      if (!(await stat(realRoot)).isDirectory()) {
        throw new Rejected(`${settings.root} is not a directory`);
      }

      try {
        await access(realRoot, constants.W_OK);
      } catch (cause) {
        throw new Rejected(`${settings.root} cannot be written to`, { cause });
      }
    },
  };
}

/** Sorted on the list a delivery already sorts on, so the two answer alike. */
function unresolvable(root: string, cause: unknown): Error {
  const code = (cause as NodeJS.ErrnoException).code;
  if (code !== undefined && UNREACHABLE.includes(code)) {
    return new Error(`${root}: ${why(cause)}`, { cause });
  }

  return new Rejected(
    code === "ENOENT" ? `${root} is not there` : `${root}: ${why(cause)}`,
    { cause },
  );
}

/** Core checks settings against the schema first, so this is the two disagreeing. */
function unreadable(destination: Destination): Error {
  return new Error(`${destination.name} has no readable filesystem settings`);
}

function overlapDetail(root: string, reserved: string): string {
  return `${root} overlaps notemap's own ${reserved}`;
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

/**
 * Where the note is, and the markdown this delivery put there — which for an
 * append is what was inserted rather than the file it was inserted into.
 */
type Landed = {
  readonly pointer: string;
  readonly written: string;
};

function carryOut(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  switch (delivery.capability) {
    case CREATE_FILE:
      return createNote(wiring, delivery, signal);
    case APPEND_TO_FILE:
      return appendToNote(wiring, delivery, signal);
    case CREATE_OR_APPEND_FILE:
      return createOrAppendToNote(wiring, delivery, signal);
    default:
      throw new Refused(`no capability named ${delivery.capability}`);
  }
}

function createNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  const args = asCreateFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-file argument set");
  }

  const filename = args.filename ?? deriveFilename(delivery);
  return create(wiring, delivery, join(args.directory, filename), signal);
}

function appendToNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  const args = asAppendToFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not an append-to-file argument set");
  }

  return append(wiring, delivery, args.path, args.heading, signal);
}

/**
 * Composed of the other two rather than deciding anything of its own: an absent
 * file is what `append` already creates, and a missing folder is what writing
 * one already makes. What this capability adds is *when* the choice is made —
 * here, against the vault as it is, rather than in a composer that may have had
 * nothing to ask.
 */
function createOrAppendToNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  const args = asCreateOrAppendFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-or-append-file argument set");
  }

  const place = placeOf(args.path);
  const filename = place.filename ?? deriveFilename(delivery);
  return append(
    wiring,
    delivery,
    join(place.directory, filename),
    args.heading,
    signal,
  );
}

/** An asset written before a `link` that then loses a race is left as debris, in exchange for never overwriting. */
async function create(
  wiring: Wiring,
  delivery: Delivery,
  target: string,
  signal?: AbortSignal,
): Promise<Landed> {
  const note = await locate(wiring.realRoot, target);

  if (await exists(note.absolute)) {
    throw new Refused(`${note.relative} is already there`);
  }

  const directory = dirname(note.absolute);
  const assets = await placeAssets(directory, delivery.assets, signal);
  const rendered = renderNote(wiring.renderers, delivery, {
    directory: within(note),
    assets,
  });

  const written = `${rendered.frontmatter}\n${rendered.body}`;
  await createFile(note.absolute, written);
  return { pointer: note.relative, written };
}

/** **Not atomic against a concurrent editor**: an open editor's buffer will overwrite this on save. */
async function append(
  wiring: Wiring,
  delivery: Delivery,
  target: string,
  heading?: string,
  signal?: AbortSignal,
): Promise<Landed> {
  const note = await locate(wiring.realRoot, target);
  const directory = dirname(note.absolute);

  const assets = await placeAssets(directory, delivery.assets, signal);
  const rendered = renderNote(wiring.renderers, delivery, {
    directory: within(note),
    assets,
  });

  const existing = await readIfPresent(note.absolute);
  if (existing === undefined) {
    // Everything in a note this delivery brought into being is what it put
    // there, frontmatter included.
    const written = `${rendered.frontmatter}\n${insertUnder("", rendered.body, heading)}`;
    await createFile(note.absolute, written);
    return { pointer: note.relative, written };
  }

  await replaceFile(
    note.absolute,
    insertUnder(existing, rendered.body, heading),
  );

  // What was inserted, not the note it was inserted into: the record answers
  // what this delivery put there, and the heading it went under is the note's
  // own structure.
  return { pointer: note.relative, written: rendered.body };
}

/**
 * The folder the note is in as the *vault* names it, which is what a renderer
 * is told. The absolute path is this adapter's business and stays here: a note
 * carrying `/var/lib/notemap/vaults/…` would be carrying the daemon's
 * filesystem into somebody's vault.
 */
function within(note: Contained): string {
  return note.relative.split("/").slice(0, -1).join("/");
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
  if (cause instanceof Refused || cause instanceof RenderingFailed) {
    return { kind: "rejected", detail: why(cause) };
  }

  const code = (cause as NodeJS.ErrnoException).code;
  return code !== undefined && UNREACHABLE.includes(code)
    ? unreachable(why(cause))
    : { kind: "rejected", detail: why(cause) };
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
