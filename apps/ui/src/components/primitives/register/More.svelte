<script lang="ts">
  import { untrack } from "svelte";

  import Action from "$components/primitives/controls/Action.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import { NO_MORE_OFFLINE } from "$lib/said";

  let {
    loading,
    offline,
    failed,
    first = false,
    onmore,
  }: {
    loading: boolean;
    offline: boolean;
    /** The last read failed: it is asked for again by a press, not by scrolling. */
    failed: boolean;
    /** Nothing is drawn yet, so the read is the page itself rather than more of it. */
    first?: boolean;
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
  <div bind:this={foot}>
    {#if offline}
      <span>{NO_MORE_OFFLINE}</span>
    {:else if first && loading}
      <Asking />
    {:else}
      <Action working={loading} onclick={onmore}>load more</Action>
    {/if}
  </div>
</Foot>
