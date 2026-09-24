<script lang="ts">
  import { untrack } from "svelte";

  import Action from "$components/primitives/controls/Action.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import { NO_MORE_OFFLINE } from "$lib/said";

  let {
    loading,
    offline,
    failed,
    onmore,
  }: {
    loading: boolean;
    offline: boolean;
    /** The last read failed: it is asked for again by a press, not by scrolling. */
    failed: boolean;
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
    {:else}
      <Action disabled={loading} onclick={onmore}>
        <span class="inline-grid">
          <span
            class="col-start-1 row-start-1 {loading ? 'invisible' : ''}"
            aria-hidden={loading}
          >
            load more
          </span>
          <span
            class="col-start-1 row-start-1 {loading ? '' : 'invisible'}"
            aria-hidden={!loading}
          >
            loading…
          </span>
        </span>
      </Action>
    {/if}
  </div>
</Foot>
