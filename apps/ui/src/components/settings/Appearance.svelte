<script lang="ts">
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import Section from "$components/settings/Section.svelte";
  import { hand, HANDS } from "$lib/hand.svelte";
  import { theme, THEMES } from "$lib/theme.svelte";
</script>

<Section name="appearance">
  <div class="border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block">theme</span>
    <Segmented
      label="Theme"
      value={theme.choice}
      options={THEMES.map((one) => ({ value: one, word: one }))}
      onchoose={(one) => theme.choose(one)}
    />
    <p class="mt-1.5 mb-0 text-small text-muted">
      Dark is rough for now. Kept on this device.
    </p>
  </div>
  <div class="border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block">hand</span>
    <Segmented
      label="Hand"
      value={hand.choice}
      options={HANDS.map((one) => ({ value: one, word: one }))}
      onchoose={(one) => hand.choose(one)}
    />
    <p class="mt-1.5 mb-0 text-small text-muted">
      Which side the + stands on, on a phone. Kept on this device.
    </p>
  </div>
</Section>
