<script lang="ts">
  import { tick } from "svelte";

  import { goto } from "$app/navigation";

  import Order from "$components/order/Order.svelte";
  import Walked from "$components/primitives/composer/Walked.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import { log } from "$lib/log.svelte";

  import { logHref } from "./href";
  import { toggled, viewsIn, VIEWS, type View } from "./views";

  /**
   * The log's head: the views it is narrowed to, taken and let go from one
   * panel as the tag filter's are, and the order beside them. None taken is
   * everything.
   */
  const id = $props.id();

  let open = $state(false);
  let at = $state<number | undefined>(undefined);
  let list = $state<HTMLElement | undefined>(undefined);

  const taken = $derived(viewsIn(log.kinds));

  async function show(): Promise<void> {
    open = true;
    at = 0;
    await tick();
    list?.focus();
  }

  function shut(): void {
    open = false;
    at = undefined;
  }

  function read(kinds: readonly View["kinds"][number][] | undefined): void {
    void goto(logHref(log.order, log.item, kinds), {
      keepFocus: true,
      noScroll: true,
    });
  }

  function toggle(view: View): void {
    read(toggled(log.kinds, view));
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      at = at === undefined ? 0 : (at + step + VIEWS.length) % VIEWS.length;
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const view = at === undefined ? undefined : VIEWS[at];
      if (view !== undefined) toggle(view);
    }
  }
</script>

<Head>
  <!-- Leaving the control is what shuts it, whichever way a person leaves. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative"
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        shut();
      }
    }}
    onkeydown={(event) => {
      if (event.key !== "Escape" || !open) return;
      event.stopPropagation();
      event.preventDefault();
      shut();
    }}
  >
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? `${id}-panel` : undefined}
      onmousedown={(event) => {
        if (open) event.preventDefault();
      }}
      onclick={() => (open ? shut() : void show())}
      class="flex items-baseline gap-1 tabular-nums"
    >
      <span class="sr-only">Narrow the log to</span>
      <span>views</span>
      {#if taken.length > 0}<span>{taken.length}</span>{/if}
      <span aria-hidden="true">▾</span>
    </button>

    {#if open}
      <div
        id="{id}-panel"
        class="absolute top-full right-0 z-30 mt-1 w-max min-w-56 border border-ink bg-ground px-2.5 py-1"
      >
        <div
          bind:this={list}
          role="listbox"
          tabindex="0"
          aria-label="Views"
          aria-multiselectable="true"
          aria-activedescendant={at === undefined
            ? undefined
            : `${id}-view-${String(at)}`}
          {onkeydown}
          class="outline-none"
        >
          {#each VIEWS as view, index (view.name)}
            {@const held = taken.includes(view)}
            <Walked
              id={at === index ? `${id}-view-${String(index)}` : undefined}
              on={at === index}
              selected={held}
              onhover={() => (at = index)}
              ontake={() => toggle(view)}
            >
              <span class="flex items-baseline gap-2.5">
                <span aria-hidden="true" class="w-[1ch] flex-none">
                  {held ? "▸" : ""}
                </span>
                <span>{view.name}</span>
              </span>
            </Walked>
          {/each}
        </div>
        {#if log.kinds !== undefined}
          <button
            type="button"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => {
              list?.focus();
              read(undefined);
            }}
            class="mt-1 block border-t border-ink pt-1 hover:underline"
          >
            everything
          </button>
        {/if}
      </div>
    {/if}
  </div>
  <Order />
</Head>

{#if log.refused !== undefined}
  <div role="status" class="pt-2 text-alarm">{log.refused}</div>
{/if}
