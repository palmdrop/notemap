<script lang="ts">
  import Bell from "$components/status/Bell.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { width } from "$lib/breakpoint";
  import { commandOf } from "$lib/command/stack.svelte";

  /**
   * The head of every page: on a phone the menu, the title, and on a list the
   * icons for search, filter (with how many it holds) and the notices (with a
   * red count). When wide the menu is a column beside it, so there is none
   * here. The icons stand for the surface's own commands, so a key and a
   * press do one thing.
   */
  let {
    title,
    list = false,
    onmenu,
  }: {
    title: string;
    /** The queue, the feed and the log: what is searched, filtered and noticed. */
    list?: boolean;
    onmenu: () => void;
  } = $props();

  const search = $derived(list ? commandOf("search") : undefined);
  const filter = $derived(list ? commandOf("filter") : undefined);
  const filtered = $derived(filter?.count ?? 0);

  function run(id: "search" | "filter"): void {
    const found = commandOf(id);
    if (found !== undefined && "run" in found) void found.run();
  }
</script>

<header
  class="sticky top-0 z-30 flex min-h-bar items-center gap-1 border-b border-rule bg-paper pr-gutter {width.wide
    ? 'pl-gutter'
    : 'pl-1'}"
>
  {#if !width.wide}
    <button
      type="button"
      onclick={onmenu}
      class="grid min-h-target min-w-target place-items-center"
    >
      <Icon name="menu" label="Menu" />
    </button>
  {/if}
  <h1 class="min-w-0 truncate font-display text-title font-normal">{title}</h1>

  {#if list}
    <div class="-mr-2 ml-auto flex items-center">
      {#if search !== undefined}
        <button
          type="button"
          title="Search (/)"
          onclick={() => run("search")}
          class="grid min-h-target min-w-target place-items-center"
        >
          <Icon name="search" label="Search" />
        </button>
      {/if}
      {#if filter !== undefined}
        <button
          type="button"
          title="Filter (f)"
          aria-label={filtered > 0
            ? `Filter, ${String(filtered)} on`
            : "Filter"}
          onclick={() => run("filter")}
          class="relative grid min-h-target min-w-target place-items-center"
        >
          <Icon name="filter" />
          {#if filtered > 0}
            <span
              aria-hidden="true"
              class="absolute top-1 right-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-ink px-1 text-badge font-bold text-paper tabular-nums"
              >{filtered}</span
            >
          {/if}
        </button>
      {/if}
      <Bell />
    </div>
  {/if}
</header>
