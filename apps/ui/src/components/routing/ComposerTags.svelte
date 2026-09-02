<script lang="ts">
  import Labelled from "$components/primitives/composer/Labelled.svelte";
  import { client } from "$lib/client";

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
  const offered = $derived($inUse.map((use) => use.name));

  let taken = $state<readonly string[]>([]);
  let adding = $state(false);
  let draft = $state("");

  // What the pool says, plus what has been taken here and not yet read back.
  const applied = $derived([
    ...names,
    ...taken.filter((name) => !names.includes(name)),
  ]);

  const shown = $derived([
    ...applied,
    ...offered.filter((name) => !applied.includes(name)),
  ]);

  function toggle(name: string): void {
    if (applied.includes(name)) {
      taken = taken.filter((each) => each !== name);
      void client.untag(item, name);
      return;
    }
    taken = [...taken, name];
    void client.tag(item, name);
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
      class="font-mono hover:text-accent {applied.includes(name)
        ? 'text-ink'
        : 'text-ink-muted'}"
    >
      {name}
    </button>
  {/each}

  {#if adding}
    <form onsubmit={add}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={draft}
        autofocus
        onblur={add}
        aria-label="Add a tag"
        class="w-24 border-b border-ink bg-transparent font-mono"
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
