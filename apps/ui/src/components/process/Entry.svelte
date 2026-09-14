<script lang="ts">
  /**
   * One entry in a band: a name and what taking it means, on one line. `why`
   * is the reason it **cannot be taken**; an unavailable one says so and stays
   * in the list rather than disappearing. `hit` is the one the typed line has
   * narrowed to, which `⏎` takes.
   */
  let {
    label,
    aside,
    why,
    hit = false,
    alarm = false,
    onchoose,
  }: {
    label: string;
    aside?: string;
    why?: string;
    hit?: boolean;
    alarm?: boolean;
    onchoose: () => void;
  } = $props();
</script>

<button
  type="button"
  onclick={onchoose}
  disabled={why !== undefined}
  aria-label={label}
  title={why}
  class="flex w-full items-baseline justify-between gap-x-[2ch] text-left hover:underline disabled:text-inert disabled:no-underline {hit
    ? 'font-semibold'
    : ''}"
>
  <span class={alarm && why === undefined ? "text-alarm" : ""}>{label}</span>
  <span class="min-w-0 truncate">{why ?? aside ?? ""}</span>
</button>
