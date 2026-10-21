import { tick, untrack } from "svelte";

import { goto } from "$app/navigation";
import { page } from "$app/state";

import { WHOLE, type Filter, type Order } from "@notemap/client";

import { client } from "$lib/client";
import {
  filtered,
  filterFor,
  GOING,
  placeKey,
  toggled,
  type FilterKind,
} from "$lib/filter";
import { leave } from "$lib/leaving.svelte";
import { keyFor, orderFor } from "$lib/order";
import { keepPlace, restorePlace } from "$lib/scroll-mark";
import type { View } from "$lib/view";

export type Filtering = {
  readonly filter: Filter;
  /** Where this reading keeps its scroll, apart from every other filter's. */
  readonly place: string;
  /** Reads the surface through the filter its address names, for its first drawing. */
  arrive(): Promise<void>;
  toggle(kind: FilterKind, value: string): void;
  clear(): void;
};

/**
 * A queue or a feed read through the filter on its address, followed as the
 * address moves — back and forward go through filters — and changed by pushing
 * a new one. Each filter keeps its own scroll place. Called while a component
 * is being set up, whose lifetime its effects share.
 */
export function filtering(
  surface: "queue" | "feed",
  how: () => { readonly view: View; readonly order: Order },
  /** The address has named another filter, and the surface is read through it. */
  onmove: () => void,
): Filtering {
  // The queue takes tags and sources alone; anything else on its address is
  // not what it is read through.
  const filter = $derived.by(() => {
    const named = filterFor(page.url);
    return surface === "feed"
      ? named
      : { ...named, states: [], destinations: [] };
  });
  const place = $derived(placeKey(surface, filter));

  // Let go of while another filter's rows replace these: a list shrinking under
  // a new filter scrolls the page, and that is not somewhere the reader went.
  let kept = $state<string | undefined>(untrack(() => place));
  $effect(() => (kept === undefined ? undefined : keepPlace(kept)));

  let entered = untrack(() => place);
  $effect(() => {
    const now = place;
    const named = filter;
    if (now === entered) return;
    entered = now;
    untrack(() => {
      kept = undefined;
      onmove();
      void (async () => {
        await client.enter(
          surface,
          orderFor(surface, page.url),
          named,
          surface === "feed" ? keyFor(page.url) : undefined,
        );
        await tick();
        if (entered !== now) return;
        restorePlace(now);
        kept = now;
      })();
    });
  });

  function go(to: Filter): void {
    const { view, order } = how();
    leave(() => void goto(filtered(page.url, to, view, order), GOING));
  }

  return {
    get filter() {
      return filter;
    },

    get place() {
      return place;
    },

    async arrive() {
      await client.enter(
        surface,
        orderFor(surface, page.url),
        filter,
        surface === "feed" ? keyFor(page.url) : undefined,
      );
      await tick();
    },

    toggle(kind, value) {
      go(toggled(filter, kind, value));
    },

    clear() {
      go(WHOLE);
    },
  };
}
