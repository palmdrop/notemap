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
  APPEND,
  asAppendToFileArguments,
  asCreateFileArguments,
  asCreateOrAppendFileArguments,
  capabilitiesFor,
  folderModeOf,
  CREATE,
  CREATE_OR_APPEND,
  deriveFilename,
  insertUnder,
  markdownOutput,
  placeOf,
  renderNote,
  RenderingFailed,
  type Renderers,
} from "@notemap/output-markdown";

import { assetNames, placeAssets } from "./assets";
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
        const composed = await compose(
          { realRoot: reached, renderers },
          delivery,
        );

        const missing = await folderMissing(composed, delivery);
        if (missing !== undefined) {
          return { kind: "rejected", detail: `${missing} is missing` };
        }

        await carryOut(composed, delivery, signal);
        // No url: a path on this host is nowhere a phone can follow.
        return {
          kind: "delivered",
          pointer: composed.note.relative,
          output: markdownOutput(composed.written),
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    /** Reads what a delivery reads, so a root that is not there is unreachable rather than empty. */
    preview: async (destination, delivery) => {
      const settings = asFilesystemSettings(destination.settings);
      if (settings === undefined) {
        throw new Rejected(why(unreadable(destination)));
      }

      // The same reach a delivery makes, so a root that is a file answers one
      // thing rather than two.
      const reached = await reachRoot(settings.root);
      if (typeof reached !== "string") throw new Error(reached.detail);

      const overlap = overlapsAny(reached, reserved);
      if (overlap !== undefined) {
        throw new Unusable(overlapDetail(reached, overlap));
      }

      try {
        const composed = await compose(
          { realRoot: reached, renderers },
          delivery,
        );
        return markdownOutput(composed.written);
      } catch (cause) {
        const failed = failure(cause);
        if (failed.kind === "rejected") throw new Rejected(failed.detail);
        throw cause;
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
async function reachRoot(root: string): Promise<string | Unreachable> {
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
 * What a delivery would put in the vault, worked out without putting any of it
 * there. Delivering is this plus the writes; previewing is this and nothing.
 */
type Composition = {
  readonly note: Contained;
  /** What this delivery contributes: for an append into a note that is there, what was inserted. */
  readonly written: string;
  readonly file: string;
  readonly fresh: boolean;
};

function compose(wiring: Wiring, delivery: Delivery): Promise<Composition> {
  switch (delivery.capability) {
    case CREATE:
      return composeCreate(wiring, delivery);
    case APPEND:
      return composeAppend(wiring, delivery);
    case CREATE_OR_APPEND:
      return composeCreateOrAppend(wiring, delivery);
    default:
      throw new Refused(`no capability named ${delivery.capability}`);
  }
}

/**
 * The folder `require` asked for, where it is not there. Looked for here rather
 * than at the decision: a template routes against vaults that are routinely
 * asleep, so the only moment worth asking at is the write.
 *
 * `rejected`, so the delivery is abandoned on the first attempt and the item
 * comes back to the queue with the decision handed back — a folder that moved
 * will not come back on its own.
 */
async function folderMissing(
  composed: Composition,
  delivery: Delivery,
): Promise<string | undefined> {
  if (folderModeOf(delivery.arguments) !== "require") return undefined;

  const folder = dirname(composed.note.relative);
  const absolute = dirname(composed.note.absolute);
  if (await exists(absolute)) return undefined;

  return folder === "." ? "the destination's own folder" : `${folder}/`;
}

/**
 * The assets land before the note that links them: one written before a `link`
 * that then loses a race is left as debris, in exchange for never overwriting.
 */
async function carryOut(
  composed: Composition,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<void> {
  await placeAssets(dirname(composed.note.absolute), delivery.assets, signal);

  if (composed.fresh) {
    await createFile(composed.note.absolute, composed.file);
    return;
  }

  // **Not atomic against a concurrent editor**: an open editor's buffer will
  // overwrite this on save.
  await replaceFile(composed.note.absolute, composed.file);
}

function composeCreate(
  wiring: Wiring,
  delivery: Delivery,
): Promise<Composition> {
  const args = asCreateFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create argument set");
  }

  const filename = args.filename ?? deriveFilename(delivery);
  return create(wiring, delivery, join(args.directory, filename));
}

function composeAppend(
  wiring: Wiring,
  delivery: Delivery,
): Promise<Composition> {
  const args = asAppendToFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not an append argument set");
  }

  return append(wiring, delivery, args.path, args.heading);
}

/**
 * Composed of the other two rather than deciding anything of its own: an absent
 * file is what `append` already creates, and a missing folder is what writing
 * one already makes. What this capability adds is *when* the choice is made —
 * here, against the vault as it is, rather than in a composer that may have had
 * nothing to ask.
 */
function composeCreateOrAppend(
  wiring: Wiring,
  delivery: Delivery,
): Promise<Composition> {
  const args = asCreateOrAppendFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-or-append argument set");
  }

  const place = placeOf(args.path);
  const filename = place.filename ?? deriveFilename(delivery);
  return append(
    wiring,
    delivery,
    join(place.directory, filename),
    args.heading,
  );
}

async function create(
  wiring: Wiring,
  delivery: Delivery,
  target: string,
): Promise<Composition> {
  const note = await locate(wiring.realRoot, target);

  if (await exists(note.absolute)) {
    throw new Refused(`${note.relative} is already there`);
  }

  const rendered = render(wiring, delivery, note);
  const file = `${rendered.frontmatter}\n${rendered.body}`;

  return { note, written: file, file, fresh: true };
}

async function append(
  wiring: Wiring,
  delivery: Delivery,
  target: string,
  heading?: string,
): Promise<Composition> {
  const note = await locate(wiring.realRoot, target);
  const rendered = render(wiring, delivery, note);

  const existing = await readIfPresent(note.absolute);
  if (existing === undefined) {
    const file = `${rendered.frontmatter}\n${insertUnder("", rendered.body, heading)}`;
    return { note, written: file, file, fresh: true };
  }

  return {
    note,
    written: rendered.body,
    file: insertUnder(existing, rendered.body, heading),
    fresh: false,
  };
}

function render(wiring: Wiring, delivery: Delivery, note: Contained) {
  return renderNote(wiring.renderers, delivery, {
    directory: within(note),
    assets: assetNames(delivery.assets),
  });
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

type Unreachable = { readonly kind: "unreachable"; readonly detail: string };

function unreachable(detail: string): Unreachable {
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
