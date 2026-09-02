import { answered, type Api } from "#api/http";
import type { ActionsApi, ActionsPage, ActionPosition } from "../types";

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

/**
 * One read and no held page: what has been walked so far belongs to whoever is
 * looking at it, so nothing here survives the surface that asked.
 */
export function createActions(deps: ActionsDeps): ActionsApi {
  return {
    async read(request): Promise<ActionsPage> {
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
      const next =
        slice.next === undefined ? undefined : positionIn(slice.next);

      return {
        values: slice.values,
        ...(next === undefined ? {} : { after: next }),
      };
    },
  };
}
