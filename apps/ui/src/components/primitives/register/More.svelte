<script lang="ts">
  import { untrack } from "svelte";

  import Box from "$components/primitives/blocks/Box.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import { NO_MORE_OFFLINE } from "$lib/said";

  let {
    loading,
    offline,
    failed,
    first = false,
    shown,
    onmore,
  }: {
    loading: boolean;
    offline: boolean;
    /** The last read failed: it is asked for again by a press, not by scrolling. */
    failed: boolean;
    /** Nothing is drawn yet, so the read is the page itself rather than more of it. */
    first?: boolean;
    /** How many rows are drawn: the pool's pages carry no total, so only this is said. */
    shown?: number;
    onmore: () => void;
  } = $props();

  let foot = $state<HTMLElement | undefined>(undefined);
  let near = $state(false);

  $effect(() => {
    if (foot === undefined || typeof IntersectionObserver === "undefined") {
      return;
    }

    const watching = new IntersectionObserver(
      ([entry]) => {
        near = entry?.isIntersecting ?? false;
      },
      { rootMargin: "0px 0px 100% 0px" },
    );
    watching.observe(foot);

    return () => watching.disconnect();
  });

  $effect(() => {
    if (near && !loading && !offline && !failed) untrack(onmore);
  });
</script>

<Foot>
  <div
    bind:this={foot}
    class="flex items-center justify-between gap-3 text-small text-muted"
  >
    {#if shown !== undefined && shown > 0}
      <span class="tabular-nums">{shown} shown</span>
    {/if}
    {#if offline}
      <span>{NO_MORE_OFFLINE}</span>
    {:else if first && loading}
      <Asking />
    {:else}
      <Box working={loading} onclick={onmore}>Load more</Box>
    {/if}
  </div>
</Foot>
