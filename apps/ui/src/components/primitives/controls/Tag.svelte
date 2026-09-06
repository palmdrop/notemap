<script lang="ts">
  /** Removing is the only thing a tag does, so the tag itself is the control. */
  let {
    name,
    fires,
    onremove,
  }: {
    name: string;
    /** The template it applies, where it applies one. */
    fires?: string;
    onremove: () => void;
  } = $props();
</script>

<button
  type="button"
  aria-label={fires === undefined
    ? `Remove ${name}`
    : `Remove ${name}, routes to ${fires}`}
  onclick={onremove}
  class="font-mono hover:text-accent"
>
  {name}{#if fires !== undefined}<span class="text-ink-muted"
      >&nbsp;→&nbsp;{fires}</span
    >{/if}
</button>
