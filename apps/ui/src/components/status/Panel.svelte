<script lang="ts">
  import type { PendingOperation } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { publish } from "$lib/command/stack.svelte";
  import { left, type Firing } from "$lib/firings.svelte";
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
    refused,
    onclose,
    ontake,
    ondismiss,
    oncancel,
    onforget,
    onrelease,
  }: {
    history: readonly Said[];
    firings: readonly Firing[];
    now: number;
    unsent: readonly PendingOperation[];
    refused: readonly PendingOperation[];
    onclose: () => void;
    ontake: (id: string) => void;
    ondismiss: (id: string) => void;
    oncancel: (firing: Firing) => void;
    /** Lets go of what has gone. */
    onforget: () => void;
    /** Lets go of a refusal: the client stops holding what the pool never took. */
    onrelease: (operation: string) => void;
  } = $props();

  publish(() => [{ id: "close", label: "close", run: onclose }], {
    atop: true,
  });

  let scroller = $state<HTMLElement | undefined>(undefined);

  // The newest is at the bottom, nearest the line, and that is where it opens.
  $effect(() => {
    if (scroller !== undefined) scroller.scrollTop = scroller.scrollHeight;
  });

  const flying = $derived(firings.length + unsent.length + refused.length > 0);
  const gone = $derived(history.some((said) => !said.live));

  function at(ms: number): string {
    return timeOf(new Date(ms).toISOString());
  }
</script>

<section
  bind:this={scroller}
  id={PANEL}
  aria-label="notices"
  class="absolute inset-x-0 bottom-full max-h-[60dvh] overflow-y-auto border-x border-t border-ink bg-ground"
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
          alarm={said.live && (said.alarm ?? said.standing === true)}
          offer={said.live && said.offer !== undefined
            ? { label: said.offer.label, take: () => ontake(said.id) }
            : undefined}
          ondismiss={said.live ? () => ondismiss(said.id) : undefined}
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

      {#each refused as held (held.id)}
        {@const said = outgoing(held.operation)}
        <Entry
          when={timeOf(held.at)}
          what={`refused — ${said.what}`}
          why={held.failure ?? "no reason given"}
          alarm
          ondismiss={() => onrelease(held.id)}
        />
      {/each}
    </ol>
  {/if}
</section>
