import { answered } from "#api/http";
import { uploaded } from "#assets/assets";
import { optimisticItem } from "#capture/envelope";
import type { Applied } from "#state/applied";
import { arrived, forget } from "#state/state";
import { replacing, type Handler } from "../handler";

export const capture: Handler<"capture"> = {
  target: (operation) => operation.envelope.id,

  apply(state, operation): Applied {
    const item = optimisticItem(operation.envelope);

    return {
      state: arrived(state, item),
      undo: (current) => forget(current, item.id),
    };
  },

  async send(sending, operation) {
    await uploaded(sending, operation);

    const outcome = await answered(
      sending.api.POST("/v1/captures", { body: operation.envelope }),
    );
    return replacing(outcome.item);
  },
};
