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
  <!-- Every tab keeps the box's room, the current one drawing it, so choosing
       another moves nothing: the first word still starts on the column, its
       box bleeding past it as a selected row's does. -->
  <nav
    class="-ml-3.5 flex min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto max-narrow:-ml-2.5"
    aria-label="Narrow the log to"
  >
    {#each tabs as tab (tab.name)}
      <!-- The current one is no link, and stays the same element, so its box
           fades between tabs rather than being drawn anew. -->
      <a
        href={tab.on ? undefined : tab.href}
        aria-current={tab.on ? "page" : undefined}
        data-word={tab.name}
        class="steady-weight -mb-px h-8 border px-3.5 leading-8 whitespace-nowrap transition-[border-color,font-weight] duration-(--duration-short) ease-fade max-narrow:px-2.5 {tab.on
          ? 'border-ink border-b-ground font-semibold'
          : 'border-transparent'}"
      >
        {tab.name}
      </a>
    {/each}
  </nav>
  <span class="shrink-0 pb-1 pl-3.5"><Order /></span>
</div>

{#if log.refused !== undefined}
  <div role="status" class="pt-2 text-alarm">{log.refused}</div>
{/if}
