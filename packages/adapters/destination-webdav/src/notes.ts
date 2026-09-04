import type { Delivery } from "@notemap/core";
import {
  APPEND_TO_FILE,
  asAppendToFileArguments,
  asCreateFileArguments,
  asCreateOrAppendFileArguments,
  CREATE_FILE,
  deriveFilename,
  insertUnder,
  placeOf,
  renderNote,
  type Note,
  type Renderers,
} from "@notemap/output-markdown";

import { assetNames, placeAssets } from "./assets";
import type { Dav } from "./dav";
import { Refused, Unreachable } from "./errors";
import { collectionsUnder, contain, type Contained } from "./paths";

export type Wiring = {
  readonly dav: Dav;
  readonly root: string;
  readonly renderers: Renderers;
};

/**
 * Where the note is, and the markdown this delivery put there — which for an
 * append into a note that was already there is what was inserted rather than
 * the note it was inserted into.
 */
export type Landed = {
  readonly pointer: string;
  readonly written: string;
};

/**
 * `PUT` with `If-None-Match: *`, which is the request that means *only if it is
 * not there*. Nothing is ever overwritten and nothing has to ask first: two
 * creates racing for one name leave one note and one refusal, where asking and
 * then writing would have left one note and one silent loss.
 */
export function createNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  return create(wiring, delivery, createTarget(delivery), signal);
}

function createTarget(delivery: Delivery): string {
  const args = asCreateFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-file argument set");
  }

  const filename = args.filename ?? deriveFilename(delivery);
  return under(args.directory, filename);
}

/**
 * Composed of the other two rather than deciding anything of its own: a note
 * that is not there is what appending already creates, and a missing collection
 * is what writing one already makes. What this capability adds is *when* the
 * choice is made — here, against the vault as it is, rather than in a composer
 * that may have had nothing to ask.
 */
export function createOrAppendToNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  const wanted = createOrAppendTarget(delivery);
  return append(wiring, delivery, wanted.target, wanted.heading, signal);
}

function createOrAppendTarget(delivery: Delivery): {
  target: string;
  heading?: string;
} {
  const args = asCreateOrAppendFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-or-append-file argument set");
  }

  const place = placeOf(args.path);
  const filename = place.filename ?? deriveFilename(delivery);
  return {
    target: under(place.directory, filename),
    ...(args.heading === undefined ? {} : { heading: args.heading }),
  };
}

/** An empty directory names the root itself, and joining it blindly would make an absolute path, which containment refuses outright. */
function under(directory: string, filename: string): string {
  return directory === "" ? filename : `${directory}/${filename}`;
}

async function create(
  wiring: Wiring,
  delivery: Delivery,
  target: string,
  signal?: AbortSignal,
): Promise<Landed> {
  const wanted = locate(wiring.root, target);

  await makeCollections(wiring.dav, wanted, signal);

  const assets = await placeAssets(wiring.dav, wanted, delivery.assets, signal);
  const rendered = renderNote(wiring.renderers, delivery, {
    directory: collectionOfPointer(wanted),
    assets,
  });
  const note = whole(rendered);

  const written = await wiring.dav.create(wanted.encoded, note, signal);
  if (written === "condition-failed") {
    throw new Refused(`${wanted.relative} is already there`);
  }

  return { pointer: wanted.relative, written: note };
}

/** How many times a note is re-read and written again before contention is somebody else's problem. */
const ATTEMPTS = 4;

/**
 * `GET` the note, insert under the heading, and `PUT` it back with
 * `If-Match: <etag>`. Without the condition two appends a second apart lose one
 * silently — the failure mode this kind has and the filesystem kind does not,
 * since `link` and `rename` do that work in the kernel.
 *
 * A note that is not there is written, and so is a heading that is not there:
 * the motivating case is a daily note whose sections appear as things are filed
 * into them, and it is the filesystem kind's behaviour under the same words.
 */
export function appendToNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<Landed> {
  const wanted = appendTarget(delivery);
  return append(wiring, delivery, wanted.target, wanted.heading, signal);
}

function appendTarget(delivery: Delivery): {
  target: string;
  heading?: string;
} {
  const args = asAppendToFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not an append-to-file argument set");
  }

  return {
    target: args.path,
    ...(args.heading === undefined ? {} : { heading: args.heading }),
  };
}

async function append(
  wiring: Wiring,
  delivery: Delivery,
  target: string,
  heading?: string,
  signal?: AbortSignal,
): Promise<Landed> {
  const note = locate(wiring.root, target);

  // Placed once, whatever happens to the note after: the collection they go in
  // is the note's, and an attempt that loses a race re-reads rather than
  // re-uploading an hour of audio.
  let assets: ReadonlyMap<string, string> | undefined;

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const existing = await wiring.dav.get(note.encoded, signal);

    if (assets === undefined) {
      if (existing === undefined)
        await makeCollections(wiring.dav, note, signal);
      assets = await placeAssets(wiring.dav, note, delivery.assets, signal);
    }

    const rendered = renderNote(wiring.renderers, delivery, {
      directory: collectionOfPointer(note),
      assets,
    });

    if (existing === undefined) {
      // Everything in a note this delivery brought into being is what it put
      // there, frontmatter included.
      const fresh = wholeUnder(rendered, heading);
      const created = await wiring.dav.create(note.encoded, fresh, signal);
      // Somebody made it between the read and the write, so it is an append now.
      if (created === "written") {
        return { pointer: note.relative, written: fresh };
      }
      continue;
    }

    if (existing.etag === undefined) {
      throw new Unreachable(
        `${note.relative} was served with no ETag, and appending without one loses whichever write lands second`,
      );
    }
    // `If-Match` compares strongly, so a weak validator fails it every time
    // however quiet the vault is. Left alone it reads as four rounds of losing
    // a race that never happened, and a proxy compressing responses is the
    // ordinary way an ETag becomes weak.
    if (existing.etag.startsWith("W/")) {
      throw new Unreachable(
        `${note.relative} was served the weak ETag ${existing.etag}, which no conditional write can match — something in front of the server is rewriting them`,
      );
    }

    const written = await wiring.dav.replace(
      note.encoded,
      insertUnder(existing.body, rendered.body, heading),
      existing.etag,
      signal,
    );
    // What was inserted, not the note it was inserted into: the heading it went
    // under is the note's own structure rather than this delivery's.
    if (written === "written") {
      return { pointer: note.relative, written: rendered.body };
    }
  }

  // Contention, not a decision: this is retryable and the delivery runner's
  // business, where `rejected` would throw the routing decision away over it.
  throw new Unreachable(
    `${note.relative} was written by somebody else during each of ${ATTEMPTS} attempts`,
  );
}

/** The whole of a note, as `create` writes one. */
function whole(rendered: Note): string {
  return `${rendered.frontmatter}\n${rendered.body}`;
}

/** The whole of a note an append brings into being, which may open with a heading. */
function wholeUnder(rendered: Note, heading?: string): string {
  return `${rendered.frontmatter}\n${insertUnder("", rendered.body, heading)}`;
}

/**
 * What a delivery would put there, and nothing put there. It makes exactly the
 * reads a delivery makes and none of its writes: `create` never asks whether
 * the note is there — its `PUT` is conditional and the server decides — so
 * neither does this, and an append reads the note it would append to because
 * whether that note exists is what decides the answer.
 *
 * Assets are named rather than placed: a name is arithmetic on the content and
 * the filename, so the links are the ones the delivery would write.
 */
export async function previewNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  if (delivery.capability === CREATE_FILE) {
    const note = locate(wiring.root, createTarget(delivery));
    return whole(render(wiring, delivery, note));
  }

  const wanted =
    delivery.capability === APPEND_TO_FILE
      ? appendTarget(delivery)
      : createOrAppendTarget(delivery);

  const note = locate(wiring.root, wanted.target);
  const rendered = render(wiring, delivery, note);
  const existing = await wiring.dav.get(note.encoded, signal);

  return existing === undefined
    ? wholeUnder(rendered, wanted.heading)
    : rendered.body;
}

function render(wiring: Wiring, delivery: Delivery, note: Contained): Note {
  return renderNote(wiring.renderers, delivery, {
    directory: collectionOfPointer(note),
    assets: assetNames(delivery.assets),
  });
}

/**
 * Nextcloud will not make a parent for a `PUT`, so each level is made in turn.
 * One that is already there answers `405`, which is the outcome asked for. The
 * root itself is never among them: a vault that is not there is reported as
 * unreachable, on the same terms as an unmounted drive, rather than conjured.
 */
export async function makeCollections(
  dav: Dav,
  path: Contained,
  signal?: AbortSignal,
): Promise<void> {
  for (const collection of collectionsUnder(path)) {
    await dav.makeCollection(collection, signal);
  }
}

/** A path inside the destination, or a refusal that names what was wrong with it. */
export function locate(root: string, target: string): Contained {
  const contained = contain(root, target);
  if (contained.kind === "refused") throw new Refused(contained.detail);
  if (contained.path.relative === "") {
    throw new Refused(`${target} names the destination itself`);
  }
  return contained.path;
}

/** What the renderer is told it is writing into: the folder as the vault names it. */
function collectionOfPointer(path: Contained): string {
  return path.relative.split("/").slice(0, -1).join("/");
}
