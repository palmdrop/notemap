<script lang="ts">
  import Bell from "$components/status/Bell.svelte";
  import Search from "$components/tags/Search.svelte";
  import { tick } from "svelte";

  import { searching } from "./searching.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { width } from "$lib/breakpoint";
  import { commandOf } from "$lib/command/stack.svelte";
  import { heading } from "$lib/heading.svelte";

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

  /** A page that draws its own head: a way out, its title, its step, its subject. */
  const own = $derived(list ? undefined : heading.current);

  const search = $derived(list ? commandOf("search") : undefined);
  const filter = $derived(list ? commandOf("filter") : undefined);
  const filtered = $derived(filter?.count ?? 0);

  const field = $derived(search?.field);
  /** On a phone the line takes the header's place while it is open. */
  const takes = $derived(!width.wide && searching.open && field !== undefined);

  let box = $state<Search | undefined>(undefined);

  // `/` or the icon asked for the caret.
  $effect(() => {
    if (searching.asked === 0) return;
    void tick().then(() => box?.focus());
  });

  // A search left open on a phone that is now empty closes with the page.
  $effect(() => {
    if (field === undefined) searching.close();
  });

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
  {#if takes && field !== undefined}
    <button
      type="button"
      onclick={() => {
        searching.close();
        if (field.words !== "") field.onsearch("", true);
      }}
      class="grid min-h-target min-w-target place-items-center"
    >
      <Icon name="back" label="Close search" />
    </button>
    <div class="min-w-0 flex-1">
      <Search
        bind:this={box}
        words={field?.words ?? ""}
        onsearch={(words, push) => field?.onsearch(words, push)}
        placeholder={`Search the ${title}`}
      />
    </div>
  {:else}
    {#if own?.out !== undefined}
      <button
        type="button"
        onclick={own.out.run}
        title="{own.out.label} (Esc)"
        class="grid min-h-target min-w-target place-items-center {width.wide
          ? '-ml-3'
          : ''}"
      >
        <Icon name={own.out.icon} label={own.out.label} />
      </button>
    {:else if !width.wide}
      <button
        type="button"
        onclick={onmenu}
        class="grid min-h-target min-w-target place-items-center"
      >
        <Icon name="menu" label="Menu" />
      </button>
    {/if}
    <h1 class="min-w-0 truncate font-display text-title font-normal">
      {own?.title ?? title}
    </h1>
    {#if width.wide && own?.under !== undefined && own.under !== ""}
      <!-- When wide the subject sits in the bar, so the bar keeps the menu's height. -->
      <span class="min-w-0 truncate pl-2 text-muted">{own.under}</span>
    {/if}
    {#if own?.aside !== undefined}
      <span class="ml-auto shrink-0 text-small text-muted tabular-nums"
        >{own.aside}</span
      >
    {/if}

    {#if list && width.wide && field !== undefined}
      <div class="ml-auto w-full max-w-[22rem] min-w-0 pl-4">
        <Search
          bind:this={box}
          words={field?.words ?? ""}
          onsearch={(words, push) => field?.onsearch(words, push)}
          placeholder={`Search the ${title}`}
          boxed
        />
      </div>
    {/if}

    {#if list}
      <div
        class="-mr-2 flex items-center {width.wide && field !== undefined
          ? 'ml-2'
          : 'ml-auto'}"
      >
        {#if search !== undefined && !width.wide}
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
  {/if}
</header>
{#if !width.wide && own?.under !== undefined && own.under !== ""}
  <p class="truncate border-b border-rule bg-paper px-gutter py-2.5 text-muted">
    {own.under}
  </p>
{/if}
