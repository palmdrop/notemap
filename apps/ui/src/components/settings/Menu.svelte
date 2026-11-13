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
      class="py-0.5 hover:underline max-wide:flex max-wide:h-11 max-wide:items-center max-wide:border-b max-wide:border-ink
        {current === one.slug ? 'font-semibold' : ''}"
    >
      {one.label}
    </a>
  {/each}
</nav>
