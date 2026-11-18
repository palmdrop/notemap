<script lang="ts">
  import { page } from "$app/state";

  import Icon from "$components/primitives/icon/Icon.svelte";
  import { client } from "$lib/client";

  import { GROUPS, SECTIONS, settingsHref, type Section } from "./href";

  /**
   * Settings as one list, in the way a phone's settings read: each group
   * under a quiet label, each section a row with its icon, the one thing
   * worth knowing before it is opened, and a chevron. The section open now
   * is marked.
   */
  const current = $derived(page.params["section"]);
  const destinations = client.destinations.all;
  const templates = client.templates.all;

  const said = $derived<Partial<Record<Section, string>>>({
    destinations: String(
      $destinations.filter((one) => one.retired !== true).length,
    ),
    templates: String($templates.length),
  });

  const capital = (word: string): string =>
    word.charAt(0).toUpperCase() + word.slice(1);
</script>

<nav aria-label="Settings" class="flex flex-col pb-4">
  {#each GROUPS as group (group)}
    <h2
      class="px-gutter pt-5 pb-1.5 text-small font-semibold text-muted wide:px-3"
    >
      {capital(group)}
    </h2>
    <ul class="m-0 list-none p-0 wide:px-1.5">
      {#each SECTIONS.filter((one) => one.group === group) as one (one.slug)}
        <li>
          <a
            href={settingsHref(one.slug)}
            aria-current={current === one.slug ? "page" : undefined}
            class="flex min-h-12 items-center gap-3 px-gutter text-ink no-underline hover:no-underline wide:rounded-control wide:px-1.5 {current ===
            one.slug
              ? 'bg-picked font-semibold'
              : 'hover:bg-hover active:bg-off-down'}"
          >
            <Icon name={one.icon} class="size-icon flex-none" />
            <span class="flex-1">{one.label}</span>
            <span class="flex items-center gap-1 text-small text-muted">
              {said[one.slug] ?? ""}
              <Icon name="chevron" class="size-5 wide:hidden" />
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/each}
</nav>
