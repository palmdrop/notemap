<script lang="ts">
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import { cancelRouting } from "$lib/firing";
  import { firings, left, type Firing } from "$lib/firings.svelte";

  /** A route in its window, said in the box grey: what, the seconds left, and Cancel. */
  let {
    firing,
    offline,
  }: {
    firing: Firing;
    offline: boolean;
  } = $props();

  const seconds = $derived(left(firing, firings.now));
</script>

<p
  class="flex items-center gap-2 rounded-tag border border-tag-line bg-tag px-2 py-1 text-small text-tag-ink"
>
  <Spinner />
  <span class="min-w-0 flex-1"
    >Routing by <b class="text-ink">{firing.name}</b
    >{#if firing.where !== undefined}, {firing.where}{/if}</span
  >
  {#if seconds !== undefined}
    <span class="tabular-nums">{seconds}s</span>
  {/if}
  {#if !offline}
    <button
      type="button"
      class="underline underline-offset-[0.2em]"
      aria-label={`Cancel routing ${firing.name}`}
      onclick={(event) => {
        event.stopPropagation();
        void cancelRouting(firing.record, firing.item, firing.name);
      }}>Cancel</button
    >
  {/if}
</p>
