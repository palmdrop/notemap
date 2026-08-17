import { acknowledged, answered, type Api } from "../api/http";
import type { RoutingApi } from "../types";

/**
 * None of this is an outbox operation. A delivery is a decision that has to
 * reach the pool to mean anything, so a client that cannot reach it says so
 * rather than promising what the outbox cannot keep.
 */
export function createRouting(api: Api): RoutingApi {
  return {
    async destinations() {
      const answer = await answered(api.GET("/v1/destinations"));
      return answer.values;
    },

    route: (item, request) =>
      answered(
        api.POST("/v1/items/{id}/route", {
          params: { path: { id: item } },
          body: request,
        }),
      ),

    markProcessed: (item, note) =>
      answered(
        api.POST("/v1/items/{id}/mark-processed", {
          params: { path: { id: item } },
          body: note === undefined ? {} : { note },
        }),
      ),

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
