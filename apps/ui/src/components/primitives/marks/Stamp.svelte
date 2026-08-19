<script lang="ts">
  import type { Snippet } from "svelte";

  import { dayOf, timeOf } from "$lib/stamp";

  /**
   * The row's title, so where a row opens in place it is also the way in.
   * `children` is the state word, where the surface has one to say.
   */
  let {
    at,
    opened,
    onopen,
    children,
  }: {
    at: string;
    opened?: boolean;
    onopen?: () => void;
    children?: Snippet;
  } = $props();
</script>

<!-- On one column the stamp is a header line across the whole row. -->
<div class="col-start-1 font-mono max-narrow:col-span-full">
  {#if onopen === undefined}
    <time datetime={at} class="block whitespace-nowrap max-narrow:inline">
      {dayOf(at)}
    </time>
    <span class="block whitespace-nowrap max-narrow:ml-[1ch] max-narrow:inline">
      {timeOf(at)}
    </span>
  {:else}
    <button
      type="button"
      onclick={onopen}
      aria-expanded={opened === true}
      class="text-left hover:text-accent"
    >
      <time datetime={at} class="block whitespace-nowrap max-narrow:inline">
        {dayOf(at)}
      </time>
      <span
        class="block whitespace-nowrap max-narrow:ml-[1ch] max-narrow:inline"
      >
        {timeOf(at)}
      </span>
    </button>
  {/if}
  {@render children?.()}
</div>
