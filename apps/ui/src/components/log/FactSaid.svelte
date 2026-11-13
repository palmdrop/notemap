<script lang="ts">
  import type { Fact } from "$lib/actions";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  let { fact }: { fact: Fact } = $props();

  /** A trigger tag reads as the trigger it is, as it does on a row. */
  const trigger = $derived(
    fact.trigger === true && fact.said.startsWith(TRIGGER_NAMESPACE)
      ? fact.said.slice(TRIGGER_NAMESPACE.length)
      : undefined,
  );
</script>

<span
  class="max-w-[22rem] shrink-0 truncate max-narrow:max-w-full {fact.alarm ===
  true
    ? 'text-alarm'
    : ''} {trigger === undefined
    ? ''
    : 'font-semibold tracking-[0.04em] [font-variant-caps:all-small-caps]'}"
>
  {trigger ?? fact.said}
</span>
