<script lang="ts">
  /** Stands in for bytes: an image still loading, or a payload type nobody draws. */
  let { label }: { label: string } = $props();
</script>

<div class="hatch flex h-50 items-end">
  <span class="m-2 bg-paper px-1.5 font-mono">{label}</span>
</div>

<style>
  .hatch {
    background: repeating-linear-gradient(
      45deg,
      color-mix(in oklch, var(--color-ink) 14%, var(--color-paper)) 0 6px,
      color-mix(in oklch, var(--color-ink) 7%, var(--color-paper)) 6px 12px
    );
  }
</style>
