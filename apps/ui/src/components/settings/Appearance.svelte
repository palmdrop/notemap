<script lang="ts">
  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import { rows, ROWS } from "$lib/rows.svelte";
  import { theme, THEMES } from "$lib/theme.svelte";
</script>

<Section name="appearance">
  <Fact name="theme">
    <span
      class="flex flex-wrap items-baseline gap-x-5"
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
    </span>
  </Fact>

  <Fact name="rows">
    <span
      class="flex flex-wrap items-baseline gap-x-5"
      role="group"
      aria-label="Rows"
    >
      {#each ROWS as one (one)}
        <button
          type="button"
          aria-pressed={rows.choice === one}
          onclick={() => rows.choose(one)}
          class="hover:underline {rows.choice === one ? 'font-semibold' : ''}"
        >
          {one}
        </button>
      {/each}
    </span>
  </Fact>
</Section>
