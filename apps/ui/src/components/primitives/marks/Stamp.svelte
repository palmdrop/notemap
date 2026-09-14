<script lang="ts">
  import { dayOf, timeOf } from "$lib/stamp";

  /** `inline` keeps date and time on one line at every width: the index's. */
  let {
    at,
    opened,
    inline = false,
    onopen,
  }: {
    at: string;
    opened?: boolean;
    inline?: boolean;
    onopen?: () => void;
  } = $props();
</script>

{#snippet written()}
  <span
    class="flex gap-[1ch] tabular-nums {inline
      ? ''
      : 'max-narrow:flex-col max-narrow:gap-0'}"
  >
    <time datetime={at} class="whitespace-nowrap">{dayOf(at)}</time>
    <span class="whitespace-nowrap">{timeOf(at)}</span>
  </span>
{/snippet}

{#if onopen === undefined}
  {@render written()}
{:else}
  <button
    type="button"
    onclick={onopen}
    aria-expanded={opened === true}
    class="block text-left hover:underline"
  >
    {@render written()}
  </button>
{/if}
