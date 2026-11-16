<script lang="ts">
  import Box from "$components/primitives/blocks/Box.svelte";
  import type { IconName } from "$components/primitives/icon/Icon.svelte";
  import { chordFor } from "$lib/command/bindings";
  import { DECIDE, WORK, type Command } from "$lib/command/command";
  import { spoken } from "$lib/command/keys";

  const ICONS: Readonly<Record<string, IconName>> = {
    process: "route",
    manual: "check",
    discard: "trash",
    undiscard: "undo",
    edit: "edit",
    copy: "copy",
    open: "file",
  };

  /**
   * The quick tier on the left — every decision that needs no destination —
   * and working with the item on the right. The list is the surface's, built
   * once and published to the keyboard in the same breath: what a button
   * reaches here is the same object a chord reaches, not a second reading of
   * the same item.
   */
  let { commands }: { commands: readonly Command[] } = $props();

  const decide = $derived(
    commands.filter((command) => command.group === DECIDE),
  );
  const work = $derived(commands.filter((command) => command.group === WORK));

  function href(command: Command): string | undefined {
    return "href" in command ? command.href : undefined;
  }

  function onclick(command: Command): (() => void) | undefined {
    return "run" in command ? () => void command.run() : undefined;
  }
</script>

{#snippet drawn(tier: readonly Command[])}
  {#each tier as command (command.id)}
    {@const chord = chordFor(command.id)}
    <Box
      icon={ICONS[command.id]}
      danger={command.alarm}
      disabled={command.refusal !== undefined}
      title={command.refusal ??
        (chord === undefined
          ? undefined
          : `${command.label} (${spoken(chord)})`)}
      href={href(command)}
      onclick={onclick(command)}
    >
      {command.label}
    </Box>
  {/each}
{/snippet}

<div
  class="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 py-1.5"
>
  <div class="flex flex-wrap items-center gap-2">
    {@render drawn(decide)}
  </div>

  <div class="flex flex-wrap items-center gap-2">
    {@render drawn(work)}
  </div>
</div>
