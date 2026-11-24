<script lang="ts">
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import { itemCount } from "$lib/batching";
  import { left, offerOf, phaseOf, type Firing } from "$lib/firings.svelte";

  /**
   * Routes in flight, on the line's left. One says which of its three steps it
   * is on: in its window, "Routing by Todo", the seconds left and Cancel;
   * being attempted, "Sending to Vault", with nothing to offer; retrying,
   * "Waiting for Vault", with Cancel. A batch is said and cancelled as one.
   * More than one otherwise are counted, and read one by one in the panel.
   * Offline, nothing offers Cancel: cancelling needs the pool.
   */
  let {
    open,
    now,
    offline = false,
    oncancel,
    oncancelbatch,
    ontoggle,
  }: {
    open: readonly Firing[];
    now: number;
    offline?: boolean;
    oncancel: (firing: Firing) => void;
    oncancelbatch: (batch: string) => void;
    ontoggle: () => void;
  } = $props();

  const batch = $derived.by(() => {
    const first = open[0]?.batch;
    return open.length > 1 &&
      first !== undefined &&
      open.every((firing) => firing.batch === first)
      ? first
      : undefined;
  });

  const soonest = $derived(
    open
      .map((firing) => left(firing, now))
      .filter((seconds) => seconds !== undefined)
      .reduce<number | undefined>(
        (least, seconds) =>
          least === undefined ? seconds : Math.min(least, seconds),
        undefined,
      ),
  );
</script>

{#snippet cancel(label: string, take: () => void)}
  {#if !offline}
    <button
      type="button"
      class="flex-none underline underline-offset-[0.2em]"
      aria-label={label}
      onclick={take}
    >
      Cancel
    </button>
  {/if}
{/snippet}

{#if open.length === 1}
  {@const firing = open[0]!}
  {@const seconds = left(firing, now)}
  {@const phase = phaseOf(firing, now)}
  <button
    type="button"
    onclick={ontoggle}
    class="flex min-w-0 flex-1 items-center gap-2 text-left"
  >
    <Spinner />
    <span class="min-w-0 truncate">
      {#if phase === "window"}
        Routing by <b>{firing.name}</b>{#if firing.where !== undefined}, {firing.where}{/if}
      {:else if phase === "sending"}
        Sending to <b>{firing.to ?? firing.name}</b>
      {:else}
        Waiting for <b>{firing.to ?? firing.name}</b>
      {/if}
    </span>
    {#if seconds !== undefined}
      <span class="flex-none text-muted tabular-nums">{seconds}s</span>
    {/if}
  </button>
  {#if offerOf(firing, now) !== undefined}
    {@render cancel(`Cancel routing ${firing.name}`, () => oncancel(firing))}
  {/if}
{:else if batch !== undefined}
  {@const name = open[0]!.name}
  <button
    type="button"
    onclick={ontoggle}
    class="flex min-w-0 flex-1 items-center gap-2 text-left"
  >
    <Spinner />
    <span class="min-w-0 truncate"
      >Routing {itemCount(open.length)} by <b>{name}</b></span
    >
    {#if soonest !== undefined}
      <span class="flex-none text-muted tabular-nums">{soonest}s</span>
    {/if}
  </button>
  {#if open.some((firing) => offerOf(firing, now) !== undefined)}
    {@render cancel(`Cancel routing ${itemCount(open.length)} by ${name}`, () =>
      oncancelbatch(batch),
    )}
  {/if}
{:else if open.length > 1}
  <button
    type="button"
    onclick={ontoggle}
    class="flex min-w-0 flex-1 items-center gap-2 text-left"
  >
    <Spinner />
    <span class="truncate">Routing {open.length}</span>
    {#if soonest !== undefined}
      <span class="flex-none text-muted tabular-nums">{soonest}s</span>
    {/if}
  </button>
{/if}
