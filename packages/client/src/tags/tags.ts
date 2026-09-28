import { answered, type Api } from "#api/http";
import type { Item, TagUse } from "#api/types";
import { filterOf, unprocessed, type Filter } from "#state/state";
import { saidBy, Unreachable } from "../errors";
import type { TagsApi } from "../types";
import type { Observable } from "rxjs";

export type TagsDeps = {
  readonly api: Api;
  /** The set completion offers, for a shell to filter rather than re-ask. */
  readonly inUse: Observable<readonly TagUse[]>;
  /** Asynchronous because the client holds it until the store has been read back. */
  readonly cached: (tags: readonly TagUse[]) => Promise<void>;
  /** Every item the client holds, for counting what the pool could not be asked. */
  readonly held: () => Iterable<Item>;
};

/**
 * The pool's own reading made over the items held: the tags carried beside the
 * filter's, counted among the items carrying all of it, in the pool's order.
 */
export function countedWithin(
  items: Iterable<Item>,
  filter: Filter,
): readonly TagUse[] {
  const counts = new Map<string, { items: number; unprocessed: number }>();

  for (const item of items) {
    const names = (item.tags ?? []).map((tag) => tag.name);
    if (!filter.every((name) => names.includes(name))) continue;

    for (const name of names) {
      if (filter.includes(name)) continue;
      const held = counts.get(name) ?? { items: 0, unprocessed: 0 };
      counts.set(name, {
        items: held.items + 1,
        unprocessed: held.unprocessed + (unprocessed(item) ? 1 : 0),
      });
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, ...count }))
    .sort((one, other) =>
      one.items === other.items
        ? one.name < other.name
          ? -1
          : 1
        : other.items - one.items,
    );
}

/**
 * Held whole rather than asked per keystroke: the set is small, and filtering
 * it is the shell's.
 */
export function createTags(deps: TagsDeps): TagsApi {
  return {
    inUse: deps.inUse,

    async load(): Promise<readonly TagUse[]> {
      const answer = await answered(deps.api.GET("/v1/tags"));
      await deps.cached(answer.values);
      return answer.values;
    },

    async within(tags) {
      const filter = filterOf(tags);
      try {
        const answer = await answered(
          deps.api.GET("/v1/tags", {
            params: { query: filter.length === 0 ? {} : { tag: [...filter] } },
          }),
        );
        return { values: answer.values, fromCache: false };
      } catch (error) {
        return {
          values: countedWithin(deps.held(), filter),
          fromCache: true,
          failure: {
            said: saidBy(error),
            refused: !(error instanceof Unreachable),
          },
        };
      }
    },
  };
}
