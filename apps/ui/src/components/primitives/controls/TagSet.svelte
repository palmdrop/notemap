<script lang="ts">
  import Tag from "$components/primitives/controls/Tag.svelte";

  let {
    names,
    offered = [],
    fires,
    onadd,
    onremove,
  }: {
    names: readonly string[];
    /** What the pool already carries, most used first. Completion, never a limit. */
    offered?: readonly string[];
    /**
     * The template this tag applies, where it applies one. A tag that files the
     * item somewhere is not an ordinary one, and completion offering it
     * unmarked is how somebody types one by accident.
     */
    fires?: (name: string) => string | undefined;
    onadd: (name: string) => void;
    onremove: (name: string) => void;
  } = $props();

  const list = $props.id();

  const completions = $derived(offered.filter((name) => !names.includes(name)));

  let adding = $state(false);
  let draft = $state("");

  function labelFor(name: string): string {
    const fired = fires?.(name);
    return fired === undefined ? name : `${name} → ${fired}`;
  }

  function add(event: Event) {
    event.preventDefault();
    const name = draft.trim();
    draft = "";
    adding = false;
    if (name !== "") onadd(name);
  }
</script>

<div class="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-4 font-mono">
  {#each names as name (name)}
    <Tag {name} fires={fires?.(name)} onremove={() => onremove(name)} />
  {/each}

  {#if adding}
    <form onsubmit={add}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={draft}
        autofocus
        onblur={add}
        aria-label="Add a tag"
        {list}
        class="w-24 border-b border-ink bg-transparent font-mono"
      />
      <datalist id={list}>
        {#each completions as name (name)}
          <option value={name} label={labelFor(name)}></option>
        {/each}
      </datalist>
    </form>
  {:else}
    <button
      type="button"
      aria-label="Add a tag"
      onclick={() => (adding = true)}
      class="text-ink-muted hover:text-accent"
    >
      +
    </button>
  {/if}
</div>
