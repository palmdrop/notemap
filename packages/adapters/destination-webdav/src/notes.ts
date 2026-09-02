import type { Delivery } from "@notemap/core";
import {
  asAppendToFileArguments,
  asCreateFileArguments,
  deriveFilename,
  insertUnder,
  renderNote,
  type Renderers,
} from "@notemap/output-markdown";

import { placeAssets } from "./assets";
import type { Dav } from "./dav";
import { Refused, Unreachable } from "./errors";
import { collectionsUnder, contain, type Contained } from "./paths";

export type Wiring = {
  readonly dav: Dav;
  readonly root: string;
  readonly renderers: Renderers;
};

/**
 * `PUT` with `If-None-Match: *`, which is the request that means *only if it is
 * not there*. Nothing is ever overwritten and nothing has to ask first: two
 * creates racing for one name leave one note and one refusal, where asking and
 * then writing would have left one note and one silent loss.
 */
export async function createNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  const args = asCreateFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not a create-file argument set");
  }

  const filename = args.filename ?? deriveFilename(delivery);
  // An empty directory names the root itself, and joining it blindly would
  // make an absolute path, which is the one shape containment refuses outright.
  const target =
    args.directory === "" ? filename : `${args.directory}/${filename}`;
  const wanted = locate(wiring.root, target);

  await makeCollections(wiring.dav, wanted, signal);

  const assets = await placeAssets(wiring.dav, wanted, delivery.assets, signal);
  const rendered = renderNote(wiring.renderers, delivery, {
    directory: collectionOfPointer(wanted),
    assets,
  });
  const written = await wiring.dav.create(
    wanted.encoded,
    `${rendered.frontmatter}\n${rendered.body}`,
    signal,
  );
  if (written === "condition-failed") {
    throw new Refused(`${wanted.relative} is already there`);
  }

  return wanted.relative;
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
export async function appendToNote(
  wiring: Wiring,
  delivery: Delivery,
  signal?: AbortSignal,
): Promise<string> {
  const args = asAppendToFileArguments(delivery.arguments);
  if (args === undefined) {
    throw new Refused("that is not an append-to-file argument set");
  }

  const note = locate(wiring.root, args.path);

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
      const created = await wiring.dav.create(
        note.encoded,
        `${rendered.frontmatter}\n${insertUnder("", rendered.body, args.heading)}`,
        signal,
      );
      // Somebody made it between the read and the write, so it is an append now.
      if (created === "written") return note.relative;
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
      insertUnder(existing.body, rendered.body, args.heading),
      existing.etag,
      signal,
    );
    if (written === "written") return note.relative;
  }

  // Contention, not a decision: this is retryable and the delivery runner's
  // business, where `rejected` would throw the routing decision away over it.
  throw new Unreachable(
    `${note.relative} was written by somebody else during each of ${ATTEMPTS} attempts`,
  );
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
