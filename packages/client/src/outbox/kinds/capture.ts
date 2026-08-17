import { answered } from "../../api/http";
import { optimisticItem } from "../../capture/envelope";
import type { Applied } from "../../state/applied";
import { cached, forget, intoQueue, withIds } from "../../state/state";
import { replacing, type Handler } from "../handler";

export const capture: Handler<"capture"> = {
  target: (operation) => operation.envelope.id,

  apply(state, operation): Applied {
    const item = optimisticItem(operation.envelope);
    const items = cached(state, [item]);

    return {
      state: {
        ...state,
        items,
        feed: withIds(state.feed, [item.id, ...state.feed.ids]),
        queue: withIds(state.queue, intoQueue(state.queue, item.id, items)),
      },
      undo: (current) => forget(current, item.id),
    };
  },

  async send(api, operation) {
    const outcome = await answered(
      api.POST("/v1/captures", { body: operation.envelope }),
    );
    return replacing(outcome.item);
  },
};
