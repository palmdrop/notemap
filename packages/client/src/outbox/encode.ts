import { answered, type Api } from "../api/http";
import type { Item } from "../api/types";
import { Unencodable } from "../errors";
import type { Operation } from "./operations";

/**
 * Sends one operation and answers the item the pool recorded, which replaces
 * the optimistic copy. Only the operations `/v1` has a route for get here; the
 * rest of the vocabulary is refused rather than mocked against an undrawn wire.
 */
export async function sendOperation(
  api: Api,
  operation: Operation,
): Promise<Item> {
  switch (operation.kind) {
    case "capture": {
      const outcome = await answered(
        api.POST("/v1/captures", { body: operation.envelope }),
      );
      return outcome.item;
    }

    case "archive":
      return answered(
        api.POST("/v1/items/{id}/archive", {
          params: { path: { id: operation.item } },
          body:
            operation.reason === undefined ? {} : { reason: operation.reason },
        }),
      );

    case "unarchive":
      return answered(
        api.POST("/v1/items/{id}/unarchive", {
          params: { path: { id: operation.item } },
          body: {},
        }),
      );

    default:
      throw new Unencodable(operation.kind);
  }
}
