<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import type { Fact } from "$lib/vocabulary";

  /** What a route, a record or a destination holds: ruled rows, label beside value. */
  let { facts }: { facts: readonly Fact[] } = $props();
</script>

<dl class="m-0">
  {#each facts as fact, at (`${String(at)}:${fact.label}`)}
    {@const body = `grid w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-rule px-gutter py-3 text-left`}
    <div data-fact={fact.label}>
      {#if fact.open !== undefined}
        <button
          type="button"
          onclick={fact.open}
          aria-label={fact.opens ?? `Change ${fact.label}`}
          class="{body} active:bg-off-down"
        >
          {@render inside(fact)}
          <Icon name="chevron" class="size-5 self-center text-muted" />
        </button>
      {:else}
        <div class={body}>{@render inside(fact)}</div>
      {/if}
    </div>
  {/each}
</dl>

{#snippet inside(fact: Fact)}
  <dt class="text-small text-muted">{fact.label}</dt>
  <dd
    class="m-0 min-w-0 break-words {fact.danger === true ? 'text-danger' : ''}"
  >
    {fact.value}
    {#if fact.line !== undefined}
      <small class="block text-small text-muted">{fact.line}</small>
    {/if}
  </dd>
{/snippet}
