import { answered } from "#api/http";
import type { ItemId } from "#api/types";
import { unchanged, type Applied, type Undo } from "#state/applied";
import { withBatch, withoutBatch } from "#state/batches";
import { settle, type ClientState } from "#state/state";
import type { Handler } from "../handler";
import type { Operation } from "../operations";
import { archiving } from "./archive";
import { tagged } from "./tags";

type Batched = Extract<Operation, { kind: "batch" }>;

function each(
  state: ClientState,
  operation: Batched,
  at: string,
): (current: ClientState, item: ItemId) => Applied {
  const { action } = operation;
  if (action.kind === "archive") {
    return (current, item) =>
      archiving(
        current,
        {
          kind: "archive",
          item,
          ...(action.reason === undefined ? {} : { reason: action.reason }),
        },
        at,
      );
  }

  const trigger = state.templates.find(
    (template) => template.id === action.template,
  )?.triggerTag;
  if (trigger === undefined || trigger === null) {
    return (current) => unchanged(current);
  }
  return (current, item) => tagged(current, { item, tag: trigger }, at);
}

/**
 * Drawn as each item's own tag or archive would be. What the pool answers
 * replaces all of it at once: every guess is taken back and every item the
 * pool returned is put in its place, so an item it refused is left as it was.
 */
export const batch: Handler<"batch"> = {
  targets: (operation) => operation.items,

  apply(state, operation, at) {
    const one = each(state, operation, at);
    const undos: Undo[] = [];
    let current = withBatch(state, {
      id: operation.batch,
      action: operation.action,
      items: operation.items,
    });

    for (const item of operation.items) {
      const applied = one(current, item);
      current = applied.state;
      undos.push(applied.undo);
    }

    return {
      state: current,
      undo: (later) =>
        withoutBatch(
          undos.reduceRight((held, undo) => undo(held), later),
          operation.batch,
        ),
    };
  },

  async send({ api }, operation) {
    const answer = await answered(
      api.POST("/v1/batches", {
        body: {
          batch: operation.batch,
          items: [...operation.items],
          action: operation.action,
        },
      }),
    );

    return (state, revert) => {
      let settled = revert(state);
      for (const outcome of answer.values) {
        if (outcome.outcome !== "refused") {
          settled = settle(settled, outcome.item);
        }
      }
      return withBatch(settled, {
        id: operation.batch,
        action: operation.action,
        items: operation.items,
        outcomes: answer.values,
      });
    };
  },
};
