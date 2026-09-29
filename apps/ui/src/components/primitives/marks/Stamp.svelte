<script lang="ts">
  import { dayOf, timeOf } from "$lib/stamp";

  /** `inline` keeps date and time on one line at every width: the index's. */
  let {
    at,
    opened,
    inline = false,
    dated = true,
    onopen,
  }: {
    at: string;
    opened?: boolean;
    inline?: boolean;
    /** Absent under a heading that already says the day: the time alone is drawn. */
    dated?: boolean;
    onopen?: () => void;
  } = $props();

  /** What the stamp is called where it draws only the time, so it still names the row. */
  const whole = $derived(dated ? undefined : `${dayOf(at)} ${timeOf(at)}`);
</script>

{#snippet written()}
  {#if dated}
    <span class="flex tabular-nums {inline ? '' : 'max-narrow:flex-col'}">
      <!-- Bold on a selected index line, which must not widen the column: each
         part holds its bold width, and the space between is a normal-weight
         `ch` rather than one that grows with the weight. -->
      <time
        datetime={at}
        data-word={dayOf(at)}
        class="steady-weight whitespace-nowrap">{dayOf(at)}</time
      >
      <span
        aria-hidden="true"
        class="w-[1ch] shrink-0 font-normal {inline ? '' : 'max-narrow:hidden'}"
      ></span>
      <span data-word={timeOf(at)} class="steady-weight whitespace-nowrap"
        >{timeOf(at)}</span
      >
    </span>
  {:else}
    <time
      datetime={at}
      data-word={timeOf(at)}
      class="steady-weight whitespace-nowrap tabular-nums">{timeOf(at)}</time
    >
  {/if}
{/snippet}

{#if onopen === undefined}
  {@render written()}
{:else}
  <button
    type="button"
    onclick={onopen}
    aria-label={whole}
    aria-expanded={opened === true}
    class="block text-left hover:underline"
  >
    {@render written()}
  </button>
{/if}
