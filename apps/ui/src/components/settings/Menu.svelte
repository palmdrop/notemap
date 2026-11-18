<script lang="ts">
  import { page } from "$app/state";

  import Band from "$components/primitives/blocks/Band.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { client } from "$lib/client";

  import { GROUPS, SECTIONS, settingsHref, type Section } from "./href";

  /**
   * The menu of sections in bands, each saying the one thing worth knowing
   * before opening it. Nested, under settings in the app's own menu.
   */
  let { nested = false }: { nested?: boolean } = $props();

  const current = $derived(page.params["section"]);
  const destinations = client.destinations.all;
  const templates = client.templates.all;

  const said = $derived<Partial<Record<Section, string>>>({
    destinations: String(
      $destinations.filter((one) => one.retired !== true).length,
    ),
    templates: String($templates.length),
  });
</script>

<nav aria-label="Settings" class="flex flex-col">
  {#each GROUPS as group (group)}
    {#if nested}
      <span
        class="border-b border-rule pt-3 pb-1 pl-[calc(var(--spacing-gutter)*2+var(--spacing-icon))] text-small text-muted"
        >{group}</span
      >
    {:else}
      <Band level={3}>{group}</Band>
    {/if}
    {#each SECTIONS.filter((one) => one.group === group) as one (one.slug)}
      <a
        href={settingsHref(one.slug)}
        aria-current={current === one.slug ? "page" : undefined}
        class="flex min-h-target items-center justify-between gap-3 border-b border-rule px-gutter text-ink no-underline hover:no-underline {nested
          ? 'pl-[calc(var(--spacing-gutter)*2+var(--spacing-icon))] text-small'
          : ''} {current === one.slug ? 'bg-off' : 'active:bg-off-down'}"
      >
        <span>{one.label}</span>
        <span class="flex items-center gap-2 text-small text-muted">
          {said[one.slug] ?? ""}
          <Icon name="chevron" class="size-5" />
        </span>
      </a>
    {/each}
  {/each}
</nav>
