<script lang="ts">
  import { goto } from "$app/navigation";

  import Order from "$components/order/Order.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { publish } from "$lib/command/stack.svelte";
  import { log } from "$lib/log.svelte";

  import { logHref } from "./href";
  import { toggled, viewsIn, VIEWS, type View } from "./views";

  /**
   * The log's filter, as the queue's and the feed's: the header's filter
   * opens it, a sheet on a phone and a panel at the right when wide, holding
   * the order and the views the log is narrowed to, each a box that can be
   * on. None on is everything.
   */
  let open = $state(false);

  const taken = $derived(viewsIn(log.kinds));

  function read(kinds: readonly View["kinds"][number][] | undefined): void {
    void goto(logHref(log.order, { item: log.item, kinds, batch: log.batch }), {
      keepFocus: true,
      noScroll: true,
    });
  }

  publish(() => [
    {
      id: "filter",
      label: "filter",
      count: taken.length,
      run: () => {
        open = true;
      },
    },
  ]);

  const BOX =
    "inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3.5";
</script>

{#if open}
  <Sheet title="filter" onclose={() => (open = false)}>
    <section class="border-b border-rule px-gutter pt-3 pb-4">
      <h3 class="mb-2">Order</h3>
      <Order />
    </section>
    <section class="border-b border-rule px-gutter pt-3 pb-4">
      <h3 class="mb-2">Views</h3>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Views">
        {#each VIEWS as view (view.name)}
          {@const on = taken.includes(view)}
          <button
            type="button"
            aria-pressed={on}
            onclick={() => read(toggled(log.kinds, view))}
            class="{BOX} {on
              ? 'border-ink bg-ink pl-2.5 text-paper'
              : 'border-off-line bg-off text-ink active:bg-off-down'}"
          >
            {#if on}<Icon name="check" class="size-4" />{/if}{view.name}
          </button>
        {/each}
      </div>
      {#if log.kinds !== undefined}
        <button
          type="button"
          class="mt-3 underline underline-offset-[0.2em]"
          onclick={() => read(undefined)}>Everything</button
        >
      {/if}
    </section>
  </Sheet>
{/if}

{#if log.refused !== undefined}
  <div role="status" class="px-gutter pt-2 text-danger">{log.refused}</div>
{/if}
