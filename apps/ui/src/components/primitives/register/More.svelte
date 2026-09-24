<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import { NO_MORE_OFFLINE } from "$lib/said";

  let {
    loading,
    offline,
    onmore,
  }: { loading: boolean; offline: boolean; onmore: () => void } = $props();

  let foot = $state<HTMLElement | undefined>(undefined);
  let near = $state(false);

  /** Where the foot stood when the last page was asked for by scrolling. */
  let askedAt: number | undefined;

  function at(element: HTMLElement): number {
    return element.getBoundingClientRect().top + window.scrollY;
  }

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

  /**
   * A page that landed moves the foot down. One that did not — a failed read —
   * leaves it where it was, and asking again from the same place would retry
   * in a loop; the button is left to do that.
   */
  $effect(() => {
    if (!near || loading || offline || foot === undefined) return;

    const now = at(foot);
    if (askedAt === now) return;

    askedAt = now;
    onmore();
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
