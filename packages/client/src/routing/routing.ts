import { acknowledged, answered, type Api } from "#api/http";
import type { ItemId, RoutingRecord } from "#api/types";
import type { RoutingApi } from "../types";

export type RoutingDeps = {
  readonly api: Api;
  /** A recorded decision takes the item out of the queue; the pool decided it. */
  readonly processed: (item: ItemId, record: RoutingRecord) => Promise<void>;
  /** The records the item is left holding, which say whether it is work again. */
  readonly withdrawn: (
    item: ItemId,
    records: readonly RoutingRecord[],
  ) => Promise<void>;
  /**
   * The item as the pool now has it. Cancelling a reservation a trigger tag
   * made takes that tag off with it, so what the client holds is stale in a way
   * the records alone do not say.
   */
  readonly reread: (item: ItemId) => Promise<void>;
};

/**
 * None of this is an outbox operation. A delivery is a decision that has to
 * reach the pool to mean anything, so a client that cannot reach it says so
 * rather than promising what the outbox cannot keep.
 */
export function createRouting(deps: RoutingDeps): RoutingApi {
  const { api } = deps;

  function recordsFor(item: ItemId): Promise<readonly RoutingRecord[]> {
    return answered(
      api.GET("/v1/items/{id}/routing", { params: { path: { id: item } } }),
    ).then((answer) => answer.values);
  }

  return {
    async route(item, request) {
      const record = await answered(
        api.POST("/v1/items/{id}/route", {
          params: { path: { id: item } },
          body: request,
        }),
      );
      await deps.processed(item, record);
      return record;
    },

    async markProcessed(item, note) {
      const record = await answered(
        api.POST("/v1/items/{id}/mark-processed", {
          params: { path: { id: item } },
          body: note === undefined ? {} : { note },
        }),
      );
      await deps.processed(item, record);
      return record;
    },

    recordsFor,

    /** Asked, never volunteered, and kept by nothing here. */
    preview(item, request) {
      return answered(
        api.POST("/v1/items/{id}/route/preview", {
          params: { path: { id: item } },
          body: request,
        }),
      );
    },

    /** Text, because that is what a shell draws; the record says what it is. */
    output(record) {
      return answered(
        api.GET("/v1/routing/{record}/output", {
          params: { path: { record } },
          parseAs: "text",
        }),
      );
    },

    async cancel(record, item) {
      await acknowledged(
        api.POST("/v1/routing/{record}/cancel", {
          params: { path: { record } },
        }),
      );

      // The pool deletes the record rather than marking it, and processed is
      // derived from holding none — so an item routed twice is still not work.
      await deps.withdrawn(item, await recordsFor(item));
      await deps.reread(item);
    },
  };
}
