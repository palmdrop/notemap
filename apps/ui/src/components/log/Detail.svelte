<script lang="ts">
  import { isCode, type Pair } from "$lib/actions";

  /**
   * `failed` carries the row's accent down to the refusal's own name, which is
   * the one fact in a failure worth reading before the rest.
   */
  let { pairs, failed = false }: { pairs: readonly Pair[]; failed?: boolean } =
    $props();
</script>

<div
  class="mt-2 grid grid-cols-[max-content_1fr] items-baseline gap-x-[1.6rem] gap-y-0.5
    max-narrow:grid-cols-[1fr] max-narrow:gap-y-0"
>
  <!-- By position, not by key: `detail` is the one field with no schema behind
       it, so two pairs may share a name and a keyed block throws on a pair. -->
  {#each pairs as pair, at (at)}
    <span class="text-ink-muted">{pair.key}</span>
    <span
      class="min-w-0 break-words max-narrow:mb-1.5 {failed && isCode(pair.key)
        ? 'text-accent'
        : ''}"
    >
      {pair.value}
    </span>
  {/each}
</div>
