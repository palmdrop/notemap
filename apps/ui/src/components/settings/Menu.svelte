<script lang="ts">
  import { page } from "$app/state";

  import { SECTIONS, settingsHref } from "$components/settings/href";

  const current = $derived(page.params["section"]);
</script>

<nav aria-label="Settings" class="flex flex-col">
  {#each SECTIONS as one (one.slug)}
    <a
      href={settingsHref(one.slug)}
      aria-current={current === one.slug ? "page" : undefined}
      class="py-0.5 hover:underline max-narrow:flex max-narrow:h-11 max-narrow:items-center max-narrow:border-b max-narrow:border-ink
        {current === one.slug ? 'font-semibold' : ''}"
    >
      {one.label}
    </a>
  {/each}
</nav>
