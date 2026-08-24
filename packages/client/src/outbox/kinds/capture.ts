import { answered } from "../../api/http";
import { optimisticItem } from "../../capture/envelope";
import type { Applied } from "../../state/applied";
import { arrived, forget } from "../../state/state";
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

  async send(api, operation) {
    const outcome = await answered(
      api.POST("/v1/captures", { body: operation.envelope }),
    );
    return replacing(outcome.item);
  },
};
