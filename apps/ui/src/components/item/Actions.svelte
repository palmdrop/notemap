<script lang="ts">
  import type { Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { commandsFor } from "$lib/command/item";
  import { DECIDE, WORK, type Command } from "$lib/command/command";

  /**
   * The quick tier on the left — every decision that needs no destination —
   * and working with the item on the right. `address` is where this item is
   * read, and is absent on the surface that already is it.
   */
  let {
    item,
    address,
    offline = false,
    onprocess,
    onedit,
  }: {
    item: Item;
    address?: string;
    offline?: boolean;
    onprocess: () => void;
    onedit: () => void;
  } = $props();

  const commands = $derived(
    commandsFor(item, { address, offline, onprocess, onedit }),
  );
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

{#snippet drawn(commands: readonly Command[])}
  {#each commands as command (command.id)}
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
