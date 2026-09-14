<script lang="ts">
  /** Stands in for bytes: an image still loading, or a payload type nobody draws. */
  let { label }: { label: string } = $props();
</script>

<div class="hatch flex h-40 max-w-80 items-end border border-ink">
  <span class="m-2 bg-ground px-1.5">{label}</span>
</div>

<style>
  .hatch {
    background: repeating-linear-gradient(
      135deg,
      transparent 0 9px,
      var(--color-ink) 9px 10px
    );
  }
</style>
