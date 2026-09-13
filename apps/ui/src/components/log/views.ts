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

function same(a: readonly ActionKind[], b: readonly ActionKind[]): boolean {
  return a.length === b.length && a.every((kind) => b.includes(kind));
}

/** Which view a set of kinds is, where it is one of them exactly. */
export function viewOf(
  kinds: readonly ActionKind[] | undefined,
): View | undefined {
  return kinds === undefined
    ? undefined
    : VIEWS.find((view) => same(view.kinds, kinds));
}
