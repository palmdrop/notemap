import {
  NotOffered,
  type CandidateEntry,
  type CandidatesAnswer,
  type CandidatesRequest,
  type Destination,
} from "@notemap/core";
import {
  APPEND_TO_FILE,
  CREATE_FILE,
  CREATE_OR_APPEND_FILE,
} from "@notemap/output-markdown";

import type { CredentialResolver } from "./credentials";
import { createDav, type Child } from "./dav";
import { Refused } from "./errors";
import { contain } from "./paths";
import { asWebdavSettings } from "./settings";

/** The same cap the filesystem kind browses under: past this it is a search problem. */
const LIMIT = 500;

/** What the field may hold. A collection is walked through either way. */
type Offered = "directory" | "file";

/** Which fields offer anything, and which of the two things they offer. Nothing else does. */
function offered(request: CandidatesRequest): Offered | undefined {
  if (request.capability === CREATE_FILE && request.field === "directory") {
    return "directory";
  }
  if (request.capability === APPEND_TO_FILE && request.field === "path") {
    return "file";
  }
  if (
    request.capability === CREATE_OR_APPEND_FILE &&
    request.field === "path"
  ) {
    return "file";
  }
  return undefined;
}

/**
 * One `PROPFIND` at `Depth: 1` per scope, which is the same one round trip per
 * level the filesystem kind pays a `readdir` for. A scope that is not there
 * answers nothing rather than refusing: a folder still being typed is an
 * ordinary state of a path, not a failure of the destination.
 */
export function webdavCandidates(credentials: CredentialResolver) {
  return async (
    destination: Destination,
    request: CandidatesRequest,
    signal?: AbortSignal,
  ): Promise<CandidatesAnswer> => {
    const kind = offered(request);
    if (kind === undefined) {
      throw new NotOffered(
        `${request.capability} has no candidates for its ${request.field} field`,
      );
    }

    const settings = asWebdavSettings(destination.settings);
    if (settings === undefined) {
      throw new Error(`${destination.name} has no readable webdav settings`);
    }

    const scope = request.scope ?? "";
    const located = contain(settings.root, scope);
    if (located.kind === "refused") throw new Refused(located.detail);

    const dav = createDav(await credentials(settings.account));
    const children = await dav.list(located.path.encoded, signal);

    return page(kind, located.path.relative, children);
  };
}

/**
 * A collection is always somewhere to look further, and is something the field
 * may hold only where the field holds folders. Collections come first, for the
 * reason the filesystem kind puts them there: a flat vault of a few hundred
 * notes would otherwise bury the handful of ways down through it.
 */
function page(
  kind: Offered,
  prefix: string,
  children: readonly Child[],
): CandidatesAnswer {
  const named = (child: Child): string =>
    prefix === "" ? child.name : `${prefix}/${child.name}`;

  const visible = children.filter((child) => !child.name.startsWith("."));
  const byName = (a: Child, b: Child): number =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

  const folders = visible
    .filter((child) => child.collection)
    .sort(byName)
    .map((child): CandidateEntry => {
      const path = named(child);
      return kind === "directory"
        ? { label: child.name, value: path, scope: path }
        : { label: child.name, scope: path };
    });

  const files =
    kind === "directory"
      ? []
      : visible
          .filter((child) => !child.collection)
          .sort(byName)
          .map((child): CandidateEntry => ({
            label: child.name,
            value: named(child),
          }));

  const all = [...folders, ...files];

  return { truncated: all.length > LIMIT, entries: all.slice(0, LIMIT) };
}
