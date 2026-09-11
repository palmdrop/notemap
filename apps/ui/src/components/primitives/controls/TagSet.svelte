<script lang="ts">
  /**
   * A chooser over known names with free entry. Every name is a word that
   * toggles: pressed where the item carries it, muted where the pool offers it.
   * What is applied stays drawn whatever is typed — it is the item's own state,
   * not a suggestion, and hiding it would make a tag look dropped.
   */
  let {
    names,
    offered = [],
    folded = false,
    fires,
    onadd,
    onremove,
  }: {
    names: readonly string[];
    /** What the pool already carries, most used first. Completion, never a limit. */
    offered?: readonly string[];
    /**
     * Draw the offer only while a name is being added. A row scanned in a feed
     * has no room for every tag in use; the composer has.
     */
    folded?: boolean;
    /**
     * The template this tag applies, where it applies one. A tag that files the
     * item somewhere is not an ordinary one, and offering it unmarked is how
     * somebody takes one by accident.
     */
    fires?: (name: string) => string | undefined;
    onadd: (name: string) => void;
    onremove: (name: string) => void;
  } = $props();

  let adding = $state(false);
  let draft = $state("");

  const wanted = $derived(draft.trim().toLowerCase());

  const shown = $derived([
    ...names,
    ...offered.filter(
      (name) =>
        !names.includes(name) &&
        (adding || !folded) &&
        name.toLowerCase().startsWith(wanted),
    ),
  ]);

  function toggle(name: string): void {
    if (names.includes(name)) onremove(name);
    else onadd(name);
  }

  function add(event: Event): void {
    event.preventDefault();
    const name = draft.trim();
    draft = "";
    adding = false;
    if (name !== "" && !names.includes(name)) onadd(name);
  }

  function put(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    // Putting this away is what the key did here, so nothing above it — a
    // composer stepping back, a row closing — also acts on the one press.
    event.stopPropagation();
    draft = "";
    adding = false;
  }
</script>

{#each shown as name (name)}
  {@const fired = fires?.(name)}
  <button
    type="button"
    aria-pressed={names.includes(name)}
    onclick={() => toggle(name)}
    aria-label={fired === undefined ? undefined : `${name}, routes to ${fired}`}
    class="font-mono hover:text-accent {names.includes(name)
      ? 'text-ink'
      : 'text-ink-muted'}"
  >
    {name}{#if fired !== undefined}<span class="text-ink-muted"
        >&nbsp;→&nbsp;{fired}</span
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
      onkeydown={put}
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
