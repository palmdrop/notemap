<script lang="ts">
  /**
   * One yes-or-no, drawn as an option draws — a mark and a word — rather than
   * as the browser's checkbox, which draws in the system's face. `label` is
   * the field's own word, and is what a screen reader hears.
   */
  let {
    label,
    on = false,
    ontoggle,
  }: {
    label: string;
    on?: boolean;
    ontoggle: () => void;
  } = $props();
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={on}
  aria-label={label}
  onclick={ontoggle}
  class="flex items-baseline gap-2.5 py-px text-left"
>
  <span aria-hidden="true" class="w-[1ch] flex-none">{on ? "■" : "□"}</span>
  <span class:font-semibold={on}>{on ? "yes" : "no"}</span>
</button>
