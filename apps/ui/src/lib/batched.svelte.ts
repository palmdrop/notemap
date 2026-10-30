import type { BatchAction, Item } from "@notemap/client";

import { asking, counted } from "./batching";
import { client } from "./client";
import type { Marking } from "./marking.svelte";
import { notices } from "./notices.svelte";
import { heldName } from "./templates";

type Asked = {
  readonly action: BatchAction;
  readonly items: readonly string[];
  readonly question: string;
  readonly notes: readonly string[];
};

/**
 * The batch a surface's marked rows are given: asked about first, then sent
 * as one operation, after which nothing is marked.
 */
export function batched(marking: Marking, rows: () => readonly Item[]) {
  // Raw, because what it holds is handed to the outbox, which copies it, and a
  // proxy cannot be copied.
  let asked = $state.raw<Asked | undefined>(undefined);

  return {
    get asked(): Asked | undefined {
      return asked;
    },

    ask(action: BatchAction): void {
      const marked = rows().filter((row) => marking.has(row.id));
      if (marked.length === 0) return;
      const name =
        action.kind === "template" ? heldName(action.template) : undefined;
      asked = {
        action,
        items: marked.map((row) => row.id),
        ...asking(counted(marked, action), action, name),
      };
    },

    async answer(go: boolean): Promise<void> {
      const sending = asked;
      asked = undefined;
      if (!go || sending === undefined) return;

      marking.clear();
      try {
        await client.batch(sending.items, sending.action);
      } catch {
        notices.raise({ what: "could not keep the batch", alarm: true });
      }
    },
  };
}
