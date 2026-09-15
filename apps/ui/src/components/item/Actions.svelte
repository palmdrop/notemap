<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";
  import { DECIDE, WORK, type Command } from "$lib/command/command";

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
    <Action
      primary={command.primary}
      alarm={command.alarm}
      disabled={command.refusal !== undefined}
      title={command.refusal}
      href={href(command)}
      onclick={onclick(command)}
    >
      {command.label}
    </Action>
  {/each}
{/snippet}

<div
  class="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-5"
>
  <div class="flex flex-wrap items-baseline gap-x-5 max-narrow:gap-x-3">
    {@render drawn(decide)}
  </div>

  <div class="flex flex-wrap items-baseline gap-x-5 max-narrow:gap-x-3">
    {@render drawn(work)}
  </div>
</div>
