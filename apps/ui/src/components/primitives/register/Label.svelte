<script lang="ts">
  /** Empty is a real value: a row's action line has no label and wants none. */
  let { name = "" }: { name?: string } = $props();
</script>

<div
  class="col-start-1 font-mono text-ink-muted max-narrow:whitespace-nowrap {name ===
  ''
    ? 'max-narrow:hidden'
    : ''}"
>
  {name}
</div>
