<script lang="ts">
  /** Removing is the only thing a tag does, so the tag itself is the control. */
  let { name, onremove }: { name: string; onremove: () => void } = $props();
</script>

<button
  type="button"
  aria-label={`Remove ${name}`}
  onclick={onremove}
  class="font-mono hover:text-accent"
>
  {name}
</button>
