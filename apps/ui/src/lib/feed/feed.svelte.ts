import { getFeed, saidBy, type Item } from "$lib/api";

export type Feed = ReturnType<typeof createFeed>;

export function createFeed() {
  let items = $state<Item[]>([]);
  let after = $state<string | undefined>(undefined);
  let exhausted = $state(false);
  let loading = $state(false);
  let failure = $state<string | undefined>(undefined);

  async function load(): Promise<void> {
    if (loading || exhausted) return;
    loading = true;
    failure = undefined;

    try {
      const page = await getFeed(after);
      items = [...items, ...page.items];
      after = page.after;
      exhausted = page.after === undefined;
    } catch (error) {
      failure = saidBy(error);
    } finally {
      loading = false;
    }
  }

  return {
    get items() {
      return items;
    },
    get loading() {
      return loading;
    },
    get failure() {
      return failure;
    },
    get more() {
      return !exhausted;
    },
    load,
    /** The capture answered with the item, so the feed needs no round trip. */
    prepend(item: Item) {
      items = [item, ...items];
    },
  };
}
