<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { PICTURE, TYPED } from "$lib/channels";
  import { client } from "$lib/client";

  let text = $state("");
  let chosen = $state<File | undefined>(undefined);
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
  $effect(() => box?.focus());

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

      await client.capture({
        channel: chosen === undefined ? TYPED : PICTURE,
        text,
        ...(asset === undefined ? {} : { asset }),
      });

      text = "";
      chosen = undefined;
      picker.value = "";
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
    <div class="flex items-end gap-4 px-3 pt-2.5">
      {#if preview !== undefined}
        <img
          src={preview}
          alt="What is about to be captured"
          class="size-21 border border-ink object-cover"
        />
      {/if}
      <span class="min-w-0 break-words">{chosen.name}</span>
      <button type="button" onclick={drop} class="shrink-0 hover:underline">
        drop
      </button>
    </div>
  {/if}

  <textarea
    bind:this={box}
    bind:value={text}
    onkeydown={(event) => {
      // The one keystroke that commits from inside the field a capture is
      // written in: `⏎` there is a new line, which prose wants.
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        void capture();
      }
    }}
    aria-label="What to capture"
    class="block min-h-[88px] w-full resize-y bg-transparent px-3 py-2.5 outline-none max-narrow:min-h-[72px]"
  ></textarea>

  <div class="flex items-baseline justify-between border-t border-ink">
    <span class="flex items-baseline gap-x-4 px-3 leading-8">
      <Action disabled={busy} onclick={() => picker.click()}>attach</Action>

      {#if said !== ""}
        <!-- Only a failure reaches this: the capture itself waits on nothing. -->
        <span role="status" class="text-alarm">{said}</span>
      {/if}
    </span>

    <span class="border-l border-ink px-3 leading-8">
      <Action primary submit disabled={busy}>capture</Action>
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
