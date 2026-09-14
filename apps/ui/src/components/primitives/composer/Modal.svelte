<script lang="ts">
  import type { Snippet } from "svelte";

  /** `subject` names what this is about: its row is behind the veil. */
  let {
    title,
    subject,
    wide = false,
    onback,
    onclose,
    children,
  }: {
    title: string;
    subject: string;
    /**
     * The composer's two-column measure. The modal grows when it gains its
     * second column and that is deliberate — it is the one moment it may change
     * size, a decision having just been made.
     */
    wide?: boolean;
    /**
     * Where `esc` goes while there is somewhere to go back to. A decision made
     * inside is undone a step at a time; only a composer with nothing settled
     * is put away by it, which is what the cross and the veil do regardless.
     */
    onback?: () => void;
    onclose: () => void;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLElement>();

  /**
   * Unless something inside has already claimed it. A composer whose first step
   * is a line you type focuses that line, and the panel taking it back would
   * make the first keystroke go nowhere.
   */
  $effect(() => {
    if (panel === undefined) return;
    if (panel.contains(document.activeElement)) return;
    panel.focus();
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    if (onback === undefined) onclose();
    else onback();
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
  class="fixed inset-0 z-20 grid justify-items-center overflow-auto bg-ink/40 p-4 pt-16"
>
  <div
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    class="max-h-full w-full self-start overflow-auto border border-ink bg-ground px-5 pt-4 pb-6
      {wide ? 'max-w-[48rem]' : 'max-w-[30rem]'}"
  >
    <div
      class="flex items-baseline justify-between gap-4 border-b border-ink pb-3"
    >
      <span>{title}</span>
      <button
        type="button"
        aria-label="Close"
        onclick={onclose}
        class="hover:underline"
      >
        ×
      </button>
    </div>

    <div class="mt-3.5 truncate">{subject}</div>

    {@render children()}
  </div>
</div>
