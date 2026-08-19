<script lang="ts">
  /** Terminal until a person acts, which is why it is the loud one. */
  let {
    what,
    why,
    ondismiss,
  }: { what: string; why: string; ondismiss: () => void } = $props();
</script>

<div role="alert" class="grid gap-1.5 bg-accent px-3 py-2.5 text-paper">
  <span class="break-words">{what}</span>
  <span class="break-words">{why}</span>
  <button type="button" onclick={ondismiss} class="justify-self-end underline">
    dismiss
  </button>
</div>
