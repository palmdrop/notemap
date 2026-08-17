import { acknowledged, answered, type Api } from "../api/http";
import type { ItemId } from "../api/types";
import type { RoutingApi } from "../types";

export type RoutingDeps = {
  readonly api: Api;
  /** A recorded decision takes the item out of the queue; the pool decided it. */
  readonly processed: (item: ItemId) => void;
};

/**
 * None of this is an outbox operation. A delivery is a decision that has to
 * reach the pool to mean anything, so a client that cannot reach it says so
 * rather than promising what the outbox cannot keep.
 */
export function createRouting(deps: RoutingDeps): RoutingApi {
  const { api } = deps;

  return {
    async destinations() {
      const answer = await answered(api.GET("/v1/destinations"));
      return answer.values;
    },

    async route(item, request) {
      const record = await answered(
        api.POST("/v1/items/{id}/route", {
          params: { path: { id: item } },
          body: request,
        }),
      );
      deps.processed(item);
      return record;
    },

    async markProcessed(item, note) {
      const record = await answered(
        api.POST("/v1/items/{id}/mark-processed", {
          params: { path: { id: item } },
          body: note === undefined ? {} : { note },
        }),
      );
      deps.processed(item);
      return record;
    },

    async recordsFor(item) {
      const answer = await answered(
        api.GET("/v1/items/{id}/routing", { params: { path: { id: item } } }),
      );
      return answer.values;
    },

    cancel: (record) =>
      acknowledged(
        api.POST("/v1/routing/{record}/cancel", {
          params: { path: { record } },
        }),
      ),
  };
}
