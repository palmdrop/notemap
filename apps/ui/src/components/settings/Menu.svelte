<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import { page } from "$app/state";

  import { SECTIONS, settingsHref } from "$components/settings/href";

  const current = $derived(page.params["section"]);
</script>

<nav aria-label="Settings" class="flex flex-col max-wide:-mx-3.5">
  {#each SECTIONS as one (one.slug)}
    <a
      href={settingsHref(one.slug)}
      aria-current={current === one.slug ? "page" : undefined}
      class="flex min-h-target items-center justify-between border-b border-rule px-gutter no-underline hover:no-underline {current ===
      one.slug
        ? 'bg-band'
        : 'active:bg-off-down'}"
    >
      <span>{one.label}</span>
      <Icon name="chevron" class="size-5 wide:hidden" />
    </a>
  {/each}
</nav>
