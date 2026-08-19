<script lang="ts">
  import Tag from "$components/primitives/controls/Tag.svelte";

  let {
    names,
    onadd,
    onremove,
  }: {
    names: readonly string[];
    onadd: (name: string) => void;
    onremove: (name: string) => void;
  } = $props();

  let adding = $state(false);
  let draft = $state("");

  function add(event: Event) {
    event.preventDefault();
    const name = draft.trim();
    draft = "";
    adding = false;
    if (name !== "") onadd(name);
  }
</script>

<div class="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-4 font-mono">
  {#each names as name (name)}
    <Tag {name} onremove={() => onremove(name)} />
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
      class="text-ink-muted hover:text-accent"
    >
      +
    </button>
  {/if}
</div>
