<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { PICTURE, TYPED } from "$lib/channels";
  import { client } from "$lib/client";
  import {
    clearDraft,
    heldPicture,
    holdPicture,
    readDraft,
    writeDraft,
  } from "$lib/draft";
  import { sayItFired } from "$lib/firing";
  import { commits } from "$lib/command/keys";
  import { slide } from "$lib/motion";
  import { offerable, triggeredBy } from "$lib/templates";

  /**
   * Whether the field takes the caret when the queue is drawn. Not on the way
   * back from processing with a row still selected: the keys are the row's then.
   */
  let { focus = true }: { focus?: boolean } = $props();

  // Read where the box is drawn, so coming back from another surface restores
  // it the same way a reload does.
  const held = readDraft();
  let text = $state(held.text);
  let tags = $state<string[]>([...held.tags]);
  let chosen = $state<File | undefined>(heldPicture());
  let busy = $state(false);
  let said = $state("");
  let picker: HTMLInputElement;
  let box = $state<HTMLTextAreaElement | undefined>(undefined);

  /**
   * The bytes as the browser can draw them. A picture goes up with the capture
   * and cannot be taken back once it has, so it is looked at before it is sent
   * rather than recognised afterwards in the feed.
   */
  let preview = $state<string | undefined>(undefined);

  $effect(() => {
    if (chosen === undefined) {
      preview = undefined;
      return;
    }

    const url = URL.createObjectURL(chosen);
    preview = url;
    return () => URL.revokeObjectURL(url);
  });

  // The queue is where capture happens, and this is the head of it.
  $effect(() => {
    if (focus) box?.focus();
  });

  $effect(() => {
    writeDraft({ text, tags });
  });

  $effect(() => {
    holdPicture(chosen);
  });

  const inUse = client.tags.inUse;
  const offered = $derived(offerable($inUse.map((use) => use.name)));

  function pick(event: Event) {
    chosen = (event.currentTarget as HTMLInputElement).files?.[0];
  }

  function drop() {
    chosen = undefined;
    picker.value = "";
  }

  async function capture() {
    if (chosen === undefined && text.trim() === "") return;

    busy = true;
    said = "";
    try {
      // Held rather than uploaded: the bytes go up when the capture drains.
      const asset =
        chosen === undefined ? undefined : await client.attach(chosen);

      const sent = [...tags];
      const item = await client.capture({
        channel: chosen === undefined ? TYPED : PICTURE,
        text,
        ...(asset === undefined ? {} : { asset }),
        ...(sent.length === 0 ? {} : { tags: sent }),
      });

      text = "";
      tags = [];
      chosen = undefined;
      picker.value = "";
      clearDraft();

      for (const name of sent) void sayItFired(item.id, name);
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<!-- The one thing at the head of the queue that is boxed. No placeholder and no
     stamp: the box is the invitation, and the capture is stamped when it is
     sent. -->
<form
  onsubmit={(event) => {
    event.preventDefault();
    void capture();
  }}
  class="mt-6 border border-ink"
>
  {#if chosen !== undefined}
    <div
      class="flex items-end gap-4 border-b border-ink px-3 py-2.5"
      transition:slide={{ fade: true }}
    >
      <!-- The picture's room is there before the picture is, so the section
           opens to the height it keeps. -->
      <div class="size-21 shrink-0 border border-ink">
        {#if preview !== undefined}
          <img
            src={preview}
            alt="What is about to be captured"
            class="size-full object-cover"
          />
        {/if}
      </div>
      <span class="min-w-0 break-words">{chosen.name}</span>
      <button
        type="button"
        onclick={drop}
        aria-label={`remove ${chosen.name}`}
        class="shrink-0 hover:underline"
      >
        ×
      </button>
    </div>
  {/if}

  <textarea
    bind:this={box}
    bind:value={text}
    onkeydown={(event) => {
      if (commits(event)) {
        event.preventDefault();
        void capture();
      }
    }}
    aria-label="What to capture"
    class="block min-h-[88px] w-full resize-y bg-transparent px-3 py-2.5 outline-none max-narrow:min-h-[72px]"
  ></textarea>

  <div class="flex items-baseline justify-between border-t border-ink">
    <span class="flex items-baseline">
      <span class="border-r border-ink px-3 leading-8">
        <Action disabled={busy} onclick={() => picker.click()}>attach</Action>
      </span>

      <span class="flex items-baseline gap-x-4 px-3 leading-8">
        <span class="flex min-w-0 flex-wrap items-baseline gap-x-[1ch]">
          <TagSet
            names={tags}
            {offered}
            label="Tag the capture"
            fires={(name) => triggeredBy(name)?.name}
            onadd={(name) => (tags = [...tags, name])}
            onremove={(name) => (tags = tags.filter((one) => one !== name))}
          />
        </span>

        {#if said !== ""}
          <!-- Only a failure reaches this: the capture itself waits on nothing. -->
          <span role="status" class="text-alarm">{said}</span>
        {/if}
      </span>
    </span>

    <span class="border-l border-ink px-3 leading-8">
      <Action primary submit working={busy}>capture</Action>
    </span>

    <input
      bind:this={picker}
      type="file"
      accept="image/*"
      onchange={pick}
      aria-label="A picture to capture"
      class="hidden"
    />
  </div>
</form>
