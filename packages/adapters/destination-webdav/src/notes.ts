import type { Delivery } from "@notemap/core";
import {
  alternatives,
  asCreateFileArguments,
  deriveFilename,
  renderNote,
  type Renderers,
} from "@notemap/output-markdown";

import type { Dav } from "./dav";
import { Refused } from "./errors";
import { collectionsUnder, contain, sibling, type Contained } from "./paths";

export type Wiring = {
  readonly dav: Dav;
  readonly root: string;
  readonly renderers: Renderers;
};

/**
 * `PUT` with `If-None-Match: *`, which is the request that means *only if it is
 * not there*. A `412` is the name being taken and the next one is tried, so a
 * create never overwrites and never has to ask first — two of them racing
 * produce two notes rather than one, which asking would not have guaranteed.
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

  const rendered = renderNote(wiring.renderers, delivery, {
    directory: collectionOfPointer(wanted),
    assets: new Map(),
  });
  const contents = `${rendered.frontmatter}\n${rendered.body}`;

  for (const candidate of alternatives(nameOf(wanted))) {
    const note = sibling(wanted, candidate);
    const written = await wiring.dav.create(note.encoded, contents, signal);
    if (written === "written") return note.relative;
  }

  throw new Refused(`every name near ${wanted.relative} is taken`);
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

export function nameOf(path: Contained): string {
  return path.segments[path.segments.length - 1] ?? "";
}

/** What the renderer is told it is writing into: the folder as the vault names it. */
function collectionOfPointer(path: Contained): string {
  return path.relative.split("/").slice(0, -1).join("/");
}
