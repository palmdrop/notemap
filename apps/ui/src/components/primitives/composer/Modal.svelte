<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Routing is the one act in the shell that composes an object rather than
   * selecting a value, and the only irreversible one, so it gets a surface of
   * its own over the register rather than a place inside it. `subject` says
   * which item that is, since the row it came from is now behind the veil.
   */
  let {
    title,
    subject,
    onclose,
    children,
  }: {
    title: string;
    subject: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLElement>();

  $effect(() => panel?.focus());
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") onclose();
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
  class="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4"
>
  <div
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    class="max-h-full w-full max-w-[var(--spacing-modal)] overflow-auto border border-ink bg-paper px-5 pt-4 pb-6 font-mono text-mono"
  >
    <div
      class="flex items-baseline justify-between gap-4 border-b border-ink pb-3"
    >
      <span>{title}</span>
      <button
        type="button"
        aria-label="Close"
        onclick={onclose}
        class="hover:text-accent"
      >
        ×
      </button>
    </div>

    <div class="mt-3.5 truncate text-ink-muted">{subject}</div>

    {@render children()}
  </div>
</div>
