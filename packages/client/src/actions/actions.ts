import { answered, type Api } from "#api/http";
import type {
  ActionsApi,
  ActionsPage,
  ActionPosition,
  ActionsRequest,
} from "../types";
import { watching, type Watching } from "./watching";

export type ActionsDeps = {
  readonly api: Api;
};

const PAGE = 25;

/** Split on the first comma only: an id may hold one, an ISO 8601 instant may not. */
function positionOf(after: string): ActionPosition {
  const comma = after.indexOf(",");
  return comma === -1
    ? { at: after }
    : { at: after.slice(0, comma), id: after.slice(comma + 1) };
}

/** The slice answers a ready-made URL; a caller here is handed the position in it. */
function positionIn(next: string): ActionPosition | undefined {
  const after = new URL(next, "http://pool").searchParams.get("after");
  return after === null ? undefined : positionOf(after);
}

function formatted(position: ActionPosition): string {
  return position.id === undefined
    ? position.at
    : `${position.at},${position.id}`;
}

/** The controls the client owns, which are nobody else's business to call. */
export type Actions = ActionsApi & {
  watched(yes: boolean): void;
  answering(yes: boolean): void;
  stop(): void;
};

/**
 * A read holds no page: what has been walked so far belongs to whoever is
 * looking at it, so nothing about it survives the surface that asked. The
 * watcher is the one thing here that keeps something — a mark, and only for
 * as long as the client lives.
 */
export function createActions(deps: ActionsDeps): Actions {
  let watcher: Watching | undefined;
  // Held against the day the watcher is built: a client nobody asks to watch
  // never asks the pool anything on its own.
  const gates = { watched: true, answering: true };

  function held(): Watching {
    watcher ??= watching(() => read({ order: "newest-first" }), gates);
    return watcher;
  }

  async function read(request: ActionsRequest): Promise<ActionsPage> {
    const { after, item, order } = request;
    const query = {
      order,
      limit: String(PAGE),
      ...(after === undefined ? {} : { after: formatted(after) }),
      ...(item === undefined ? {} : { item }),
    };

    const slice = await answered(
      deps.api.GET("/v1/actions", { params: { query } }),
    );
    const next = slice.next === undefined ? undefined : positionIn(slice.next);

    return {
      values: slice.values,
      ...(next === undefined ? {} : { after: next }),
    };
  }

  return {
    read,
    watch: () => held().changes,

    watched: (yes) => {
      gates.watched = yes;
      watcher?.watched(yes);
    },
    answering: (yes) => {
      gates.answering = yes;
      watcher?.answering(yes);
    },
    stop: () => watcher?.stop(),
  };
}
