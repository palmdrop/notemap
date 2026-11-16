<script lang="ts">
  import { page } from "$app/state";

  import Band from "$components/primitives/blocks/Band.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { client } from "$lib/client";

  import { GROUPS, SECTIONS, settingsHref, type Section } from "./href";

  /** The menu of sections in bands, each saying the one thing worth knowing before opening it. */
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
    <Band level={3}>{group}</Band>
    {#each SECTIONS.filter((one) => one.group === group) as one (one.slug)}
      <a
        href={settingsHref(one.slug)}
        aria-current={current === one.slug ? "page" : undefined}
        class="flex min-h-target items-center justify-between gap-3 border-b border-rule px-gutter text-ink no-underline hover:no-underline {current ===
        one.slug
          ? 'bg-off'
          : 'active:bg-off-down'}"
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
