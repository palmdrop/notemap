<script lang="ts">
  import { dayOf, timeOf } from "$lib/stamp";

  /**
   * The row's title, so where a row opens in place it is also the way in. On a
   * phone the rail is too narrow for both on one line, so the time drops under.
   */
  let {
    at,
    opened,
    onopen,
  }: {
    at: string;
    opened?: boolean;
    onopen?: () => void;
  } = $props();
</script>

{#snippet written()}
  <span class="flex gap-[1ch] max-narrow:flex-col max-narrow:gap-0">
    <time datetime={at} class="whitespace-nowrap">{dayOf(at)}</time>
    <span class="whitespace-nowrap text-ink-muted">{timeOf(at)}</span>
  </span>
{/snippet}

{#if onopen === undefined}
  {@render written()}
{:else}
  <button
    type="button"
    onclick={onopen}
    aria-expanded={opened === true}
    class="block text-left hover:text-accent"
  >
    {@render written()}
  </button>
{/if}
