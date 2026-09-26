<script lang="ts">
  import { rise, slide } from "$lib/motion";

  /** Terminal until a person acts, which is why it is the loud one. */
  let {
    what,
    why,
    ondismiss,
  }: { what: string; why: string; ondismiss: () => void } = $props();
</script>

<div
  in:rise
  out:slide={{ fade: true }}
  role="alert"
  class="grid gap-1.5 border border-alarm bg-ground px-3 py-2.5 text-alarm"
>
  <span class="break-words">{what}</span>
  <span class="break-words">{why}</span>
  <button type="button" onclick={ondismiss} class="justify-self-end underline">
    dismiss
  </button>
</div>
