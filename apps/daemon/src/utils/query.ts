import {
  FEED_KEYS,
  ITEM_STATES,
  tagFilter,
  type DestinationId,
  type FeedFilter,
  type FeedKey,
  type ItemState,
  type ReadOrder,
  type SourceId,
  type SurfaceFilter,
} from "@notemap/core";

import { DEFAULT_LIMIT, MAX_LIMIT, READ_ORDERS } from "../constants";
import type {
  DaemonRefusal,
  FeedFilterQuery,
  FeedKeyQuery,
  OrderedPageQuery,
  PageQuery,
  SurfaceFilterQuery,
} from "../types";
import { parsePosition } from "./positions";

export function readPage(url: URL): PageQuery {
  const rawLimit = url.searchParams.get("limit");
  const rawAfter = url.searchParams.get("after");

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    // Not `Number()`: it reads "" and " " as 0, and a limit the client did not
    // write is worse than one refused.
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
      return { ok: false, refusal: { kind: "bad-limit", limit: rawLimit } };
    }
    limit = Number(rawLimit);
    if (limit > MAX_LIMIT) {
      return {
        ok: false,
        refusal: { kind: "limit-too-large", limit, max: MAX_LIMIT },
      };
    }
  }

  if (rawAfter === null) return { ok: true, limit };

  const after = parsePosition(rawAfter);
  if (after === undefined) {
    return { ok: false, refusal: { kind: "bad-position", after: rawAfter } };
  }

  return { ok: true, limit, after };
}

export function readPageQuery(
  url: URL,
  fallback: ReadOrder = "newest-first",
): OrderedPageQuery {
  const rawOrder = url.searchParams.get("order");
  const order = (rawOrder ?? fallback) as ReadOrder;
  if (!READ_ORDERS.includes(order)) {
    return {
      ok: false,
      refusal: {
        kind: "bad-order",
        order: rawOrder ?? "",
        allowed: READ_ORDERS,
      },
    };
  }

  const page = readPage(url);
  return page.ok ? { ...page, order } : page;
}

/** Capture time unless the read names the other key. */
export function readFeedKey(url: URL): FeedKeyQuery {
  const by = url.searchParams.get("by") ?? "capture";
  return FEED_KEYS.includes(by as FeedKey)
    ? { ok: true, by: by as FeedKey }
    : { ok: false, refusal: { kind: "bad-by", by, allowed: FEED_KEYS } };
}

type Read<T> =
  | { readonly ok: true; readonly values: readonly T[] }
  | { readonly ok: false; readonly refusal: DaemonRefusal };

/** Every value a parameter repeats, each once, or the refusal of the first one `refuse` names. */
function repeated<T extends string>(
  url: URL,
  name: string,
  refuse: (value: string) => DaemonRefusal | undefined,
): Read<T> {
  const values: T[] = [];
  for (const value of url.searchParams.getAll(name)) {
    const refusal = refuse(value);
    if (refusal !== undefined) return { ok: false, refusal };
    if (!values.includes(value as T)) values.push(value as T);
  }
  return { ok: true, values };
}

const notEmpty =
  (kind: "bad-destination" | "bad-source") =>
  (value: string): DaemonRefusal | undefined =>
    value === "" ? { kind, value } : undefined;

const aState = (value: string): DaemonRefusal | undefined =>
  ITEM_STATES.includes(value as ItemState)
    ? undefined
    : { kind: "bad-state", value, allowed: ITEM_STATES };

/** Every `tag` the query repeats, all of which an item must carry, and any one `source`. */
function surfaceFilter(url: URL): SurfaceFilterQuery {
  const tags = tagFilter(url.searchParams.getAll("tag"));
  if (tags.kind === "refused") return { ok: false, refusal: tags.refusal };
  const sources = repeated<SourceId>(url, "source", notEmpty("bad-source"));
  if (!sources.ok) return sources;

  return {
    ok: true,
    filter: {
      ...(tags.value.length === 0 ? {} : { tags: tags.value }),
      ...(sources.values.length === 0 ? {} : { sources: sources.values }),
    },
  };
}

/** The parameters only the feed takes, which every other surface refuses. */
const FEED_ONLY = ["by", "state", "destination"] as const;

/** Ignoring one of these would answer a filtered question with an unfiltered page. */
export function readSurfaceFilter(url: URL): SurfaceFilterQuery {
  const unsupported = FEED_ONLY.find((name) => url.searchParams.has(name));
  return unsupported === undefined
    ? surfaceFilter(url)
    : {
        ok: false,
        refusal: { kind: "unsupported-parameter", parameter: unsupported },
      };
}

export function readFeedFilter(url: URL): FeedFilterQuery {
  const surface = surfaceFilter(url);
  if (!surface.ok) return surface;
  const states = repeated<ItemState>(url, "state", aState);
  if (!states.ok) return states;
  const destinations = repeated<DestinationId>(
    url,
    "destination",
    notEmpty("bad-destination"),
  );
  if (!destinations.ok) return destinations;

  return {
    ok: true,
    filter: {
      ...surface.filter,
      ...(states.values.length === 0 ? {} : { states: states.values }),
      ...(destinations.values.length === 0
        ? {}
        : { destinations: destinations.values }),
    },
  };
}

/** A filter as `next` carries it, every value repeated under its parameter. */
export function filterParameters(
  filter: FeedFilter | SurfaceFilter,
): Record<string, readonly string[]> {
  const feed: FeedFilter = filter;
  return {
    tag: feed.tags ?? [],
    state: feed.states ?? [],
    destination: feed.destinations ?? [],
    source: feed.sources ?? [],
  };
}
