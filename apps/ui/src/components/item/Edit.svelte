<script lang="ts">
  import { untrack } from "svelte";
  import type { Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { TYPED } from "$lib/channels";
  import { client } from "$lib/client";
  import { commits } from "$lib/command/keys";
  import { publish } from "$lib/command/stack.svelte";

  let { item, ondone }: { item: Item; ondone: () => void } = $props();

  // Drawn inside whatever surface opened it, and so ahead of that surface's
  // own `esc`: the draft is the nearer thing to leave, and this is the same
  // way out as the `cancel` beside `save`.
  publish(() => [{ id: "cancel", label: "cancel", run: ondone }]);

  /** A draft starts from what the item says and then stops following it. */
  let draft = $state(untrack(() => client.says(item)));

  function save(event: Event) {
    event.preventDefault();
    ondone();
    void client.edit(item.id, client.saying(item, draft), TYPED);
  }
</script>

<!-- The capture box again, where the capture is: what was written is rewritten
     in the same kind of box it was written in. -->
<form onsubmit={save} class="border border-ink">
  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    bind:value={draft}
    autofocus
    onkeydown={(event) => {
      if (commits(event)) save(event);
    }}
    aria-label="What it says"
    class="block min-h-[88px] w-full resize-y bg-transparent px-3 py-2.5 outline-none max-narrow:min-h-[72px]"
  ></textarea>

  <div class="flex items-baseline justify-between border-t border-ink">
    <span class="px-3 leading-8">
      <Action onclick={ondone}>cancel</Action>
    </span>
    <span class="border-l border-ink px-3 leading-8">
      <Action primary submit>save</Action>
    </span>
  </div>
</form>
