import type { ActionKind } from "@notemap/client";

export type View = {
  readonly name: string;
  readonly kinds: readonly ActionKind[];
};

/**
 * Every kind is in a view: the union of the sets must be the whole of
 * `ActionKind`, so a kind the pool grows fails here rather than falling out of
 * every reading but `everything`.
 */
type Covering<T extends readonly View[]> =
  ActionKind extends T[number]["kinds"][number] ? T : never;

function covering<const T extends readonly View[]>(views: Covering<T>): T {
  return views;
}

/**
 * The readings a log is narrowed to. Each is a set of the pool's own kinds, and
 * the URL carries the kinds rather than the name, so a link somebody wrote by
 * hand reads the same way as one of these.
 */
export const VIEWS: readonly View[] = covering([
  {
    name: "routing",
    kinds: [
      "routed",
      "template-fired",
      "delivery-failed",
      "delivery-cancelled",
    ],
  },
  {
    name: "captures",
    kinds: [
      "captured",
      "amended",
      "revised",
      "artifact-added",
      "artifact-corrected",
    ],
  },
  {
    name: "classification",
    kinds: [
      "tagged",
      "untagged",
      "suggestion-added",
      "suggestion-accepted",
      "suggestion-rejected",
      "archived",
      "unarchived",
    ],
  },
  {
    name: "pool",
    kinds: [
      "destination-created",
      "destination-renamed",
      "destination-reconfigured",
      "destination-retired",
      "destination-unretired",
      "destination-deleted",
      "template-created",
      "template-edited",
      "template-deleted",
      "pool-setting-changed",
      "enrichment-requested",
      "work-failed",
      "work-abandoned",
      "assets-released",
      "purged",
      "actions-cleared",
    ],
  },
]);

export const KIND_PARAM = "kind";

/** The kinds a URL names, or nothing where it names none. */
export function kindsIn(url: URL): readonly ActionKind[] | undefined {
  const said = url.searchParams.get(KIND_PARAM);
  if (said === null || said === "") return undefined;
  return said.split(",") as ActionKind[];
}

/** The views a set of kinds holds whole: what a filter draws as taken. */
export function viewsIn(
  kinds: readonly ActionKind[] | undefined,
): readonly View[] {
  return kinds === undefined
    ? []
    : VIEWS.filter((view) => view.kinds.every((kind) => kinds.includes(kind)));
}

/**
 * The kinds read once one view is taken into the reading or out of it. What a
 * reading holds is the union of its views, so a kind a hand-written link named
 * outside every view it holds whole goes with the first change. None taken is
 * the whole log.
 */
export function toggled(
  kinds: readonly ActionKind[] | undefined,
  view: View,
): readonly ActionKind[] | undefined {
  const held = viewsIn(kinds);
  const taken = held.includes(view)
    ? held.filter((one) => one !== view)
    : [...held, view];
  return taken.length === 0 ? undefined : taken.flatMap((one) => one.kinds);
}
