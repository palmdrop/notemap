<script lang="ts">
  import { untrack } from "svelte";
  import type { Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { TYPED } from "$lib/channels";
  import { client } from "$lib/client";

  let { item, ondone }: { item: Item; ondone: () => void } = $props();

  /** A draft starts from what the item says and then stops following it. */
  let draft = $state(untrack(() => client.says(item)));

  function save(event: SubmitEvent) {
    event.preventDefault();
    ondone();
    void client.edit(item.id, client.saying(item, draft), TYPED);
  }
</script>

<form onsubmit={save} class="grid gap-3">
  <textarea
    bind:value={draft}
    rows="4"
    aria-label="What it says"
    class="w-full resize-y border-b border-ink bg-transparent"></textarea>
  <div class="flex gap-x-gutter">
    <Action submit>save</Action>
    <Action onclick={ondone}>cancel</Action>
  </div>
</form>
