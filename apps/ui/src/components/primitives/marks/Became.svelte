<script lang="ts">
  import Icon, { type IconName } from "$components/primitives/icon/Icon.svelte";

  /** What became of an item, on its row: an icon and the word, quiet. */
  let { word }: { word: string } = $props();

  const ICONS: Readonly<Record<string, IconName>> = {
    discarded: "trash",
    revised: "edit",
    revision: "edit",
    manual: "check",
  };
  const WORDS: Readonly<Record<string, string>> = {
    discarded: "Discarded",
    revised: "Revised",
    revision: "Revision of an earlier capture",
    manual: "Done",
  };
</script>

<span class="flex w-max max-w-full items-center gap-1.5 text-small text-muted">
  <Icon name={ICONS[word] ?? "route"} class="size-4 flex-none" />
  <span>{WORDS[word] ?? word}</span>
</span>
