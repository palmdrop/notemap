<script lang="ts">
  /**
   * `why` is the reason an option **cannot be taken**; an unavailable one says
   * so and stays in the list rather than disappearing. `note` is the other
   * thing that reads like a remark beside a label and is not one: what taking
   * this option would mean. They draw alike and only `why` disables, so an
   * option explained with `why` is an option nobody can choose.
   *
   * `implied` is the option the field comes out as while nobody has chosen —
   * a destination's setting, a schema's default — marked hollow so it can be
   * read without being mistaken for a choice.
   */
  let {
    label,
    chosen = false,
    implied = false,
    why,
    note,
    onchoose,
  }: {
    label: string;
    chosen?: boolean;
    implied?: boolean;
    why?: string;
    note?: string;
    onchoose: () => void;
  } = $props();

  const said = $derived(why ?? note);
</script>

<button
  type="button"
  onclick={onchoose}
  disabled={why !== undefined}
  aria-pressed={chosen}
  class="flex w-full items-baseline gap-2.5 py-px text-left"
>
  <span aria-hidden="true" class="w-[1ch] flex-none">
    {chosen ? "▸" : implied ? "▹" : ""}
  </span>
  <span class:font-semibold={chosen}>{label}</span>
  {#if implied && !chosen}
    <span class="sr-only">(default)</span>
  {/if}
  {#if said !== undefined}
    <span class="ml-auto">{said}</span>
  {/if}
</button>
