<script lang="ts">
  import Order from "$components/order/Order.svelte";
  import { log } from "$lib/log.svelte";

  import { logHref } from "./href";
  import { VIEWS, viewOf } from "./views";

  /**
   * The log's head: the five readings as tabs on one rule, the current one
   * bold and boxed on three sides so it sits on the rule, and the order at the
   * right of the same rule. Below `narrow` the tabs scroll sideways rather than
   * wrap, so the rule stays one line.
   */
  const current = $derived(viewOf(log.kinds));

  const tabs = $derived([
    {
      name: "everything",
      href: logHref(log.order, log.item),
      on: log.kinds === undefined,
    },
    ...VIEWS.map((view) => ({
      name: view.name,
      href: logHref(log.order, log.item, view.kinds),
      on: current?.name === view.name,
    })),
  ]);
</script>

<div
  class="flex items-end justify-between border-b border-ink pt-5 max-narrow:pt-3.5"
>
  <nav
    class="flex min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto"
    aria-label="Narrow the log to"
  >
    {#each tabs as tab (tab.name)}
      {#if tab.on}
        <span
          aria-current="page"
          class="-mb-px h-8 border border-ink border-b-ground px-3.5 leading-8 font-semibold whitespace-nowrap max-narrow:px-2.5"
        >
          {tab.name}
        </span>
      {:else}
        <a
          href={tab.href}
          class="h-8 px-3.5 leading-8 whitespace-nowrap first:pl-0 max-narrow:px-2.5"
        >
          {tab.name}
        </a>
      {/if}
    {/each}
  </nav>
  <span class="shrink-0 pb-1 pl-3.5"><Order /></span>
</div>

{#if log.refused !== undefined}
  <div role="status" class="pt-2 text-alarm">{log.refused}</div>
{/if}
