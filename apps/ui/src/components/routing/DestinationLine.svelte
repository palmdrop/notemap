<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { search } from "$lib/matching";
  import type { Takeable } from "$lib/processing";

  /**
   * Typing narrows the bands drawn under this line by name. An accelerator
   * over them, never a replacement: the bands are the way in for a pointer and
   * for somebody who does not know the names.
   *
   * Once one is taken it **leaves the line** and reads as the settled
   * destination, so the line holds nothing but the place after it. That is why
   * a name with a space or a slash in it needs no escaping and no rule — it is
   * never a segment of anything.
   */
  let {
    destinations,
    unusable = {},
    ontake,
    ontyped,
    focus = true,
  }: {
    /**
     * Everything offered, which is the templates, the destinations and the two
     * the shell invents. The line does not care which is which: a choice is a
     * name to type and an id to hand back.
     */
    destinations: readonly Takeable[];
    /** Why one cannot be taken, by id. A reason is shown and the name stays. */
    unusable?: Record<string, string | undefined>;
    ontake: (id: string) => void;
    /** What is typed, for the bands beneath to narrow by. */
    ontyped?: (typed: string) => void;
    /** Takes the caret on arrival: not on a phone, where it would raise the keyboard over the list. */
    focus?: boolean;
  } = $props();

  let typed = $state("");
  let input = $state<HTMLInputElement | undefined>(undefined);

  // The first step of a decision you type is this line, so it takes the caret
  // rather than waiting to be clicked into.
  $effect(() => {
    if (focus) input?.focus();
  });

  $effect(() => ontyped?.(typed.trim()));

  const takeable = $derived(
    destinations.filter(
      (one) => one.retired !== true && unusable[one.id] === undefined,
    ),
  );

  const matching = $derived(
    search(takeable, typed.trim(), (one) => [one.name]),
  );

  const only = $derived(
    typed.trim() !== "" && matching.length === 1 ? matching[0] : undefined,
  );

  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (only === undefined) return;
    event.preventDefault();
    ontake(only.id);
  }
</script>

<div
  class="flex min-h-11 items-center gap-2 rounded-control border border-rule bg-tag px-3 focus-within:border-ink"
>
  <Icon name="search" class="size-5 text-muted" />
  <input
    bind:this={input}
    bind:value={typed}
    {onkeydown}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    aria-label="what became of it"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded="true"
    aria-controls="destination-bands"
    placeholder="Find a template or a destination"
    class="min-w-0 flex-1 bg-transparent outline-none"
  />
</div>
