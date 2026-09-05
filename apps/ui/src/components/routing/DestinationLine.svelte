<script lang="ts">
  import type { Takeable } from "$lib/processing";

  /**
   * Typing narrows the destinations by name. An accelerator over the list
   * beside it, never a replacement: the list is the way in for a pointer and
   * for somebody who does not know the names.
   *
   * Once one is taken it **leaves the line** and reads in the chrome, so the
   * line holds nothing but the place after it. That is why a name with a space
   * or a slash in it needs no escaping and no rule — it is never a segment of
   * anything.
   */
  let {
    destinations,
    unusable = {},
    ontake,
  }: {
    /**
     * Everything the `where` step offers, which is the destinations and the two
     * the shell invents. The line does not care which is which: a choice is a
     * name to type and an id to hand back.
     */
    destinations: readonly Takeable[];
    /** Why one cannot be taken, by id. A reason is shown and the name stays. */
    unusable?: Record<string, string | undefined>;
    ontake: (id: string) => void;
  } = $props();

  let typed = $state("");
  let input = $state<HTMLInputElement | undefined>(undefined);

  // The first step of a composer you type is this line, so it takes the caret
  // rather than waiting to be clicked into.
  $effect(() => input?.focus());

  const takeable = $derived(
    destinations.filter(
      (one) => one.retired !== true && unusable[one.id] === undefined,
    ),
  );

  const matching = $derived(
    takeable.filter((one) =>
      one.name.toLowerCase().startsWith(typed.trim().toLowerCase()),
    ),
  );

  /** One match is a name; several are a prefix, and taking one of them would be a guess. */
  const only = $derived(
    typed.trim() !== "" && matching.length === 1 ? matching[0] : undefined,
  );

  /**
   * Nothing typed narrows nothing, and the whole list is already drawn beneath
   * this — twice over is not a choice, it is the same list said again.
   */
  const narrowed = $derived(typed.trim() === "" ? [] : matching);

  function take(): void {
    if (only !== undefined) ontake(only.id);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (only === undefined) return;
    event.preventDefault();
    take();
  }
</script>

<div class="font-mono">
  <input
    bind:this={input}
    bind:value={typed}
    {onkeydown}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    aria-label="which destination"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={narrowed.length > 0}
    aria-controls="destination-line-matches"
    class="w-full px-2 py-0.5 outline-none field"
  />

  <div
    id="destination-line-matches"
    role="listbox"
    aria-label="destinations"
    class="mt-2"
  >
    {#each narrowed as one (one.id)}
      <div role="option" tabindex="-1" aria-selected={only?.id === one.id}>
        {one.name}
      </div>
    {/each}

    {#if narrowed.length > 1}
      <p class="mt-1 text-ink-muted">{narrowed.length} match</p>
    {/if}
  </div>
</div>
