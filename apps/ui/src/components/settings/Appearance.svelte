<script lang="ts">
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import { theme, THEMES } from "$lib/theme.svelte";
</script>

<Section name="appearance">
  <Fact name="theme">
    <Segmented
      label="Theme"
      value={theme.choice}
      options={THEMES.map((one) => ({ value: one, word: one }))}
      onchoose={(one) => theme.choose(one)}
    />
  </Fact>
</Section>
