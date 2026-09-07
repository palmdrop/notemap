<script lang="ts">
  import Labelled from "$components/primitives/composer/Labelled.svelte";
  import { client } from "$lib/client";
  import { sayItFired } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";

  /**
   * The same classification the collapsed row makes, offered where routing is
   * decided. It goes through the outbox on its own and **drains independently
   * of the route**: a route that then fails leaves the tags applied, which is
   * the honest outcome — the person classified the item, and that was true.
   */
  let {
    item,
    names,
  }: {
    item: string;
    /** What the item already carries, so the pool's own list draws as taken or not. */
    names: readonly string[];
  } = $props();

  const inUse = client.tags.inUse;
  const offered = $derived(offerable($inUse.map((use) => use.name)));

  let taken = $state<readonly string[]>([]);
  /** Dropped here and not yet read back, which is what the pool still says it carries. */
  let dropped = $state<readonly string[]>([]);
  let adding = $state(false);
  let draft = $state("");

  // What the pool says, plus and minus what has been decided here since.
  const applied = $derived([
    ...names.filter((name) => !dropped.includes(name)),
    ...taken.filter((name) => !names.includes(name)),
  ]);

  const every = $derived([
    ...applied,
    ...offered.filter((name) => !applied.includes(name)),
  ]);

  /**
   * Typing narrows what is offered. What is already applied stays whatever is
   * typed: it is the item's own state, not a suggestion, and hiding it would
   * make a tag look dropped.
   */
  const shown = $derived(
    draft.trim() === ""
      ? every
      : every.filter(
          (name) =>
            applied.includes(name) ||
            name.toLowerCase().startsWith(draft.trim().toLowerCase()),
        ),
  );

  /**
   * A tag that files the item somewhere is not an ordinary one, and taking it
   * by accident is what the mark exists to stop. It says which template rather
   * than only that there is one: `route/` is a namespace, not a decision.
   */
  function fires(name: string): string | undefined {
    return triggeredBy(name)?.name;
  }

  function toggle(name: string): void {
    if (applied.includes(name)) {
      taken = taken.filter((each) => each !== name);
      dropped = [...dropped, name];
      void client.untag(item, name);
      return;
    }
    dropped = dropped.filter((each) => each !== name);
    taken = [...taken, name];
    void tagged(name);
  }

  /** A trigger tag files the item, so what it did is said as soon as it is known. */
  async function tagged(name: string): Promise<void> {
    await client.tag(item, name);
    await sayItFired(item, name);
  }

  function add(event: Event): void {
    event.preventDefault();
    const name = draft.trim();
    draft = "";
    adding = false;
    if (name !== "" && !applied.includes(name)) toggle(name);
  }
</script>

<Labelled name="tags">
  {#each shown as name (name)}
    <button
      type="button"
      aria-pressed={applied.includes(name)}
      onclick={() => toggle(name)}
      aria-label={fires(name) === undefined
        ? undefined
        : `${name}, routes to ${fires(name)}`}
      class="font-mono hover:text-accent {applied.includes(name)
        ? 'text-ink'
        : 'text-ink-muted'}"
    >
      {name}{#if fires(name) !== undefined}<span class="text-ink-muted"
          >&nbsp;→&nbsp;{fires(name)}</span
        >{/if}
    </button>
  {/each}

  {#if adding}
    <form onsubmit={add}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={draft}
        autofocus
        onblur={add}
        onkeydown={(event) => {
          if (event.key !== "Escape") return;
          // Putting this away is what the key did here, so the composer does
          // not also step its decision back on the one press.
          event.stopPropagation();
          draft = "";
          adding = false;
        }}
        aria-label="Add a tag"
        class="w-24 px-2 py-0.5 font-mono outline-none field"
      />
    </form>
  {:else}
    <button
      type="button"
      aria-label="Add a tag"
      onclick={() => (adding = true)}
      class="text-ink-muted hover:text-accent">+</button
    >
  {/if}
</Labelled>
