import type { BatchAction, Item } from "@notemap/client";

import { saidFor } from "./asked";
import { asking, counted } from "./batching";
import { client } from "./client";
import type { Marking } from "./marking.svelte";
import { notices } from "./notices.svelte";
import { triggeredBy } from "./templates";

type Asked = {
  readonly action: BatchAction;
  readonly items: readonly string[];
  readonly question: string;
  readonly notes: readonly string[];
};

/**
 * What a surface's marked rows are given. What processes them — a discard, a
 * tag that applies a template — is asked about first; the rest is sent at
 * once, being undone the same way it was done.
 */
export function batched(marking: Marking, rows: () => readonly Item[]) {
  // Raw, because what it holds is handed to the outbox, which copies it, and a
  // proxy cannot be copied.
  let asked = $state.raw<Asked | undefined>(undefined);

  async function send(
    items: readonly string[],
    action: BatchAction,
  ): Promise<void> {
    try {
      await client.batch(items, action);
    } catch {
      notices.raise({ what: "could not keep the batch", alarm: true });
    }
  }

  return {
    get asked(): Asked | undefined {
      return asked;
    },

    do(action: BatchAction): void {
      const marked = rows().filter((row) => marking.has(row.id));
      if (marked.length === 0) return;
      const items = marked.map((row) => row.id);

      const template =
        action.kind === "tag" ? triggeredBy(action.tag) : undefined;
      if (action.kind !== "archive" && template === undefined) {
        void send(items, action);
        return;
      }

      const where =
        action.kind === "tag"
          ? saidFor(action.tag, action.arguments)
          : undefined;
      asked = {
        action,
        items,
        ...asking(
          counted(marked, action, template?.id),
          action,
          template?.name,
          where,
        ),
      };
    },

    async answer(go: boolean): Promise<void> {
      const sending = asked;
      asked = undefined;
      if (!go || sending === undefined) return;

      marking.clear();
      await send(sending.items, sending.action);
    },
  };
}
