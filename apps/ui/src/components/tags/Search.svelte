<script lang="ts">
  import { untrack } from "svelte";

  /**
   * The words a list is searched by, typed in its head. Settled a moment after
   * the last key, so the list is read once a word is, not at every letter. The
   * first change of a run of typing pushes an entry, so going back takes the
   * words off as it takes a tag; the rest of the run replaces it. Never
   * remembered: a list opened afresh is the whole of it.
   */
  let {
    words,
    onsearch,
  }: {
    /** As the address holds them, which back and `clear filters` move. */
    words: string;
    onsearch: (words: string, push: boolean) => void;
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
  placeholder="search"
  class="w-[16ch] min-w-0 border-b border-ink bg-transparent px-0 py-0 outline-none"
/>
