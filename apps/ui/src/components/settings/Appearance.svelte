<script lang="ts">
  import Section from "$components/settings/Section.svelte";
  import { theme, THEMES } from "$lib/theme.svelte";
</script>

<Section name="appearance">
  <div
    class="flex flex-wrap items-baseline gap-x-5 py-3"
    role="group"
    aria-label="Theme"
  >
    {#each THEMES as one (one)}
      <button
        type="button"
        aria-pressed={theme.choice === one}
        onclick={() => theme.choose(one)}
        class="hover:underline {theme.choice === one ? 'font-semibold' : ''}"
      >
        {one}
      </button>
    {/each}
  </div>
</Section>
