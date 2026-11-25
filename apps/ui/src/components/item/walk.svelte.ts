import type { Item, ListState } from "@notemap/client";

import { resolve } from "$app/paths";
import { client } from "$lib/client";

/**
 * Where an item stands in the list it is read in: the queue while it is work,
 * the feed after. Opened at its address, neither list has been read, so the
 * one it belongs to is read for it.
 */
export function walkOf(id: () => string) {
  const queue = held(client.queue);
  const feed = held(client.feed);

  let askedQueue = false;
  let askedFeed = false;

  const list = $derived.by(() => {
    const queued = queue.current?.items ?? [];
    if (queued.some((one) => one.id === id())) {
      return { items: queued, home: resolve("/") };
    }
    return { items: feed.current?.items ?? [], home: resolve("/feed") };
  });

  $effect(() => {
    const wanted = id();
    const q = queue.current;
    if (q === undefined) return;
    if (!askedQueue && q.items.length === 0 && !q.loading) {
      askedQueue = true;
      void client.loadQueue().catch(() => undefined);
      return;
    }
    if (q.loading || q.items.some((one) => one.id === wanted)) return;
    const f = feed.current;
    if (f !== undefined && !askedFeed && f.items.length === 0 && !f.loading) {
      askedFeed = true;
      void client.loadFeed().catch(() => undefined);
    }
  });

  const at = $derived(list.items.findIndex((one) => one.id === id()));

  return {
    get items(): readonly Item[] {
      return list.items;
    },
    get home(): string {
      return list.home;
    },
    /** Its place in the list, -1 where the list does not hold it. */
    get at(): number {
      return at;
    },
    get previous(): Item | undefined {
      return at > 0 ? list.items[at - 1] : undefined;
    },
    get next(): Item | undefined {
      return at !== -1 && at < list.items.length - 1
        ? list.items[at + 1]
        : undefined;
    },
  };
}

/** A list's state, held for as long as the calling component lives. */
function held(source: {
  subscribe(next: (value: ListState) => void): { unsubscribe(): void };
}) {
  let current = $state.raw<ListState | undefined>(undefined);
  $effect(() => {
    const watching = source.subscribe((value) => {
      current = value;
    });
    return () => watching.unsubscribe();
  });
  return {
    /** Absent until the list has said anything, which reads as loading. */
    get current(): ListState | undefined {
      return current;
    },
  };
}
