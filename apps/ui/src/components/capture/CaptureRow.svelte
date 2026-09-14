<script lang="ts">
  import { onMount } from "svelte";
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
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

  // The queue is where capture happens, and this is the first row of it.
  $effect(() => box?.focus());

  /**
   * The row shows a minute and the capture is stamped when it is sent, so the
   * clock turns over on the minute boundary rather than on an interval that
   * straddles one — otherwise the row reads 14:07 and the item lands at 14:08.
   */
  let at = $state(new Date().toISOString());
  onMount(() => {
    let tick: ReturnType<typeof setTimeout>;

    const onward = () => {
      const now = new Date();
      at = now.toISOString();
      tick = setTimeout(
        onward,
        60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()),
      );
    };

    onward();
    return () => clearTimeout(tick);
  });

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

<Rail first>
  <Stamp {at} />
  <div class="mt-2">not captured</div>
</Rail>

<Body first>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void capture();
    }}
  >
    <textarea
      bind:this={box}
      bind:value={text}
      placeholder="Anything worth keeping…"
      onkeydown={(event) => {
        // The one keystroke that commits from inside the field a capture is
        // written in: `⏎` there is a new line, which prose wants.
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          void capture();
        }
      }}
      aria-label="What to capture"
      class="min-h-18 w-full resize-y bg-transparent outline-none"></textarea>

    {#if chosen !== undefined}
      <div class="mt-3 flex items-end gap-4">
        {#if preview !== undefined}
          <img
            src={preview}
            alt="What is about to be captured"
            class="size-21 border border-ink object-cover"
          />
        {/if}
        <span class="min-w-0 break-words">{chosen.name}</span>
        <button type="button" onclick={drop} class="shrink-0 hover:underline"
          >drop</button
        >
      </div>
    {/if}

    <ActionRow>
      <Action primary submit disabled={busy}>capture</Action>
      <Action disabled={busy} onclick={() => picker.click()}>attach</Action>

      <input
        bind:this={picker}
        type="file"
        accept="image/*"
        onchange={pick}
        aria-label="A picture to capture"
        class="hidden"
      />

      {#if said !== ""}
        <!-- Only a failure reaches this: the capture itself waits on nothing. -->
        <span role="status" class="text-alarm">{said}</span>
      {/if}
    </ActionRow>
  </form>
</Body>
