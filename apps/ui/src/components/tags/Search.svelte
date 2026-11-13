<script lang="ts">
  import { untrack } from "svelte";

  /**
   * The words a list is searched by, typed in the header. Settled a moment after
   * the last key, so the list is read once a word is, not at every letter. The
   * first change of a run of typing pushes an entry, so going back takes the
   * words off as it takes a tag; the rest of the run replaces it. Never
   * remembered: a list opened afresh is the whole of it.
   */
  let {
    words,
    onsearch,
    placeholder = "search",
    boxed = false,
  }: {
    /** As the address holds them, which back and `clear filters` move. */
    words: string;
    onsearch: (words: string, push: boolean) => void;
    placeholder?: string;
    /** A box, as a wide header holds it; ruled under, as a phone's does. */
    boxed?: boolean;
  } = $props();

  const SETTLES = 250;

  let typed = $state(untrack(() => words));
  let field = $state<HTMLInputElement | undefined>(undefined);
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let pushed = false;

  // The address moved under the line — back, or the filters cleared — and
  // nothing typed is waiting to replace it.
  $effect(() => {
    const now = words;
    untrack(() => {
      if (waiting === undefined) typed = now;
    });
  });

  // Gone before the typing settled: the address it would have changed is another surface's now.
  $effect(() => () => clearTimeout(waiting));

  function input(): void {
    clearTimeout(waiting);
    waiting = setTimeout(() => {
      waiting = undefined;
      onsearch(typed, !pushed);
      pushed = true;
    }, SETTLES);
  }

  export function focus(): void {
    field?.focus();
    field?.select();
  }
</script>

<input
  bind:this={field}
  bind:value={typed}
  oninput={input}
  onblur={() => (pushed = false)}
  type="search"
  aria-label="search"
  {placeholder}
  class="min-h-9 w-full min-w-0 bg-transparent outline-none {boxed
    ? 'rounded-control border border-rule px-3'
    : 'border-b border-rule px-2'}"
/>
