<script lang="ts">
  import { untrack } from "svelte";
  import type { Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { PICTURE, TYPED } from "$lib/channels";
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

  type Held = {
    readonly asset: string;
    readonly url: string;
    readonly name: string;
    readonly image: boolean;
  };

  /** The picture the draft holds, starting from the item's own where it has one. */
  let picture = $state<Held | undefined>(
    untrack(() => {
      const carried = client.picture(item);
      if (carried === undefined) return undefined;
      return {
        asset: carried.asset,
        url: client.assetContent(carried.asset),
        name: carried.filename ?? "picture",
        image: carried.mime?.startsWith("image/") ?? false,
      };
    }),
  );

  let busy = $state(false);
  let picker: HTMLInputElement;

  async function pick(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file === undefined) return;

    busy = true;
    try {
      const asset = await client.attach(file);
      picture = {
        asset,
        url: client.assetContent(asset),
        name: file.name,
        image: file.type.startsWith("image/"),
      };
    } finally {
      busy = false;
      picker.value = "";
    }
  }

  function drop() {
    picture = undefined;
  }

  function save(event: Event) {
    event.preventDefault();
    if (busy) return;
    ondone();
    const payload = client.pictured(client.saying(item, draft), picture?.asset);
    void client.edit(item.id, payload, picture === undefined ? TYPED : PICTURE);
  }
</script>

<!-- The capture box again, where the capture is: what was written is rewritten
     in the same kind of box it was written in. -->
<form onsubmit={save} class="border border-ink">
  {#if picture !== undefined}
    <div class="flex items-end gap-4 px-3 pt-2.5">
      {#if picture.image}
        <img
          src={picture.url}
          alt="What it carries"
          class="size-21 border border-ink object-cover"
        />
      {/if}
      <span class="min-w-0 break-words">{picture.name}</span>
      <button type="button" onclick={drop} class="shrink-0 hover:underline">
        drop
      </button>
    </div>
  {/if}

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
    <span class="flex items-baseline gap-x-4 px-3 leading-8">
      <Action onclick={ondone}>cancel</Action>
      <Action disabled={busy} onclick={() => picker.click()}>attach</Action>
    </span>
    <span class="border-l border-ink px-3 leading-8">
      <Action primary submit working={busy}>save</Action>
    </span>

    <input
      bind:this={picker}
      type="file"
      accept="image/*"
      onchange={pick}
      aria-label="A picture to carry"
      class="hidden"
    />
  </div>
</form>
