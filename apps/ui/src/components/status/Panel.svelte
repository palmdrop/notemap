<script lang="ts">
  import type { PendingOperation } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { publish } from "$lib/command/stack.svelte";
  import { left, type Firing } from "$lib/firings.svelte";
  import { slide } from "$lib/motion";
  import type { Said } from "$lib/notices.svelte";
  import { outgoing } from "$lib/outgoing";
  import { timeOf } from "$lib/stamp";

  import Entry from "./Entry.svelte";
  import { PANEL } from "./panel";

  /**
   * Opened above the status line: this session's notices, oldest first so the
   * newest is nearest the line, and then everything in flight. What a notice
   * offered is offered only while the notice is live.
   */
  let {
    history,
    firings,
    now,
    unsent,
    onclose,
    ontake,
    oncancel,
    onforget,
  }: {
    history: readonly Said[];
    firings: readonly Firing[];
    now: number;
    unsent: readonly PendingOperation[];
    onclose: () => void;
    ontake: (id: string) => void;
    oncancel: (firing: Firing) => void;
    /** Lets go of what has gone. */
    onforget: () => void;
  } = $props();

  publish(() => [{ id: "close", label: "close", run: onclose }], {
    atop: true,
  });

  let scroller = $state<HTMLElement | undefined>(undefined);

  // The newest is at the bottom, nearest the line, and that is where it opens.
  $effect(() => {
    if (scroller !== undefined) scroller.scrollTop = scroller.scrollHeight;
  });

  const flying = $derived(firings.length + unsent.length > 0);
  const gone = $derived(history.some((said) => !said.live));

  function at(ms: number): string {
    return timeOf(new Date(ms).toISOString());
  }
</script>

<!--
  Hung from `notices` at the line's left, and clear of the line's rule so the
  two never read as one box. A phone has no room to spare, so there it spans.
-->
<section
  bind:this={scroller}
  transition:slide
  id={PANEL}
  aria-label="notices"
  class="absolute bottom-[calc(100%+1px)] left-0 max-h-[60dvh] w-full max-w-panel overflow-y-auto border-x border-t border-ink bg-ground max-narrow:max-w-none"
>
  <header
    class="sticky top-0 flex items-baseline justify-between gap-4 border-b border-ink bg-ground px-3 py-1.5"
  >
    <span class="font-semibold">notices</span>
    <span class="flex gap-4">
      {#if gone}
        <button type="button" class="underline" onclick={onforget}>clear</button
        >
      {/if}
      <a href="/log" class="underline">log</a>
      <button type="button" class="underline" onclick={onclose}>close</button>
    </span>
  </header>

  {#if history.length === 0 && !flying}
    <p class="px-3 py-2">Nothing has been said yet.</p>
  {/if}

  {#if history.length > 0}
    <ol aria-label="said">
      {#each history as said (said.id)}
        <Entry
          when={at(said.at)}
          what={said.what}
          why={said.why}
          about={said.about}
          href={said.href}
          alarm={said.alarm === true}
          offer={said.live && said.offer !== undefined
            ? { label: said.offer.label, take: () => ontake(said.id) }
            : undefined}
        />
      {/each}
    </ol>
  {/if}

  {#if flying}
    <h2
      class="sticky top-0 border-y border-ink bg-ground px-3 py-1.5 font-semibold"
    >
      in flight
    </h2>
    <ol aria-label="in flight">
      {#each firings as firing (firing.record)}
        {@const seconds = left(firing, now)}
        <Entry
          what={`routing · ${firing.name}`}
          href={firing.href}
          offer={{ label: "cancel", take: () => oncancel(firing) }}
        >
          {#snippet mark()}
            {#if seconds !== undefined}
              <span class="tabular-nums">{seconds}s</span>
            {:else}
              <Asking />
            {/if}
          {/snippet}
        </Entry>
      {/each}

      {#each unsent as held (held.id)}
        {@const said = outgoing(held.operation)}
        <Entry
          when={timeOf(held.at)}
          what={said.what}
          why={held.state === "unreachable"
            ? "pending · the pool is out of reach"
            : "pending"}
          href={itemHref(said.item)}
        />
      {/each}
    </ol>
  {/if}
</section>
