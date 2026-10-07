<script lang="ts">
  import type { Attachment, RoutingPreview } from "@notemap/client";

  import {
    NO_PREVIEW_OFFERED,
    PREVIEW_NOT_TEXT,
    PREVIEW_UNREACHABLE,
  } from "$lib/said";

  import { tick } from "svelte";

  import AttachedLines from "$components/item/AttachedLines.svelte";
  import AttachedPictures from "$components/item/AttachedPictures.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { grow } from "$lib/motion";

  /**
   * The head of the file the destination would write, in a ruled block: five
   * lines, and the rest behind `more`. A destination that offers no preview,
   * or that cannot be reached, says so in the block in plain ink — neither is
   * a failure of the decision. `place` is the full path above it, bold, so
   * the block says both where and what. It is five lines tall before there is
   * anything to draw in it, so an answer landing moves nothing under it;
   * while `asking`, the mark stands on the first of them, or beside the path
   * over an answer that is about to be replaced. The capture's own
   * `attachments` are drawn around what would be written as a delivered
   * record draws them — pictures above, every other file under it — since a
   * block that is the picture writes no words about it.
   */
  let {
    shown,
    place,
    attachments = [],
    asking = false,
    subject,
  }: {
    shown?: RoutingPreview;
    place?: string;
    attachments?: readonly Attachment[];
    asking?: boolean;
    /** What is being asked, named once it is slow to answer. */
    subject?: string;
  } = $props();

  const LINES = 5;

  let whole = $state(false);
  let written = $state<HTMLElement>();

  async function unclamp() {
    const element = written;
    const from = element?.offsetHeight ?? 0;
    whole = true;
    await tick();
    if (element !== undefined) grow(element, from);
  }

  const text = $derived(
    shown?.kind === "previewed" ? shown.content?.text : undefined,
  );

  const lines = $derived(text?.split("\n") ?? []);
  const cut = $derived(!whole && lines.length > LINES);
  const drawn = $derived(cut ? lines.slice(0, LINES).join("\n") : text);
  const blank = $derived(drawn?.trim() === "");

  const said = $derived.by(() => {
    switch (shown?.kind) {
      case "not-offered":
        return NO_PREVIEW_OFFERED;
      case "unreachable":
        return PREVIEW_UNREACHABLE;
      case "rejected":
        return `This would be refused: ${shown.detail}`;
      case "previewed":
        return shown.content !== undefined && shown.content.text === undefined
          ? `${PREVIEW_NOT_TEXT} ${shown.content.mediaType}`
          : undefined;
      default:
        return undefined;
    }
  });
</script>

<div class="border border-ink px-3 py-2">
  {#if place !== undefined || (asking && shown !== undefined)}
    <div
      class="mb-2 flex items-baseline justify-between gap-x-[2ch] border-b border-ink pb-2"
    >
      <span class="min-w-0 font-semibold break-words">{place ?? ""}</span>
      {#if asking && shown !== undefined}
        <Asking {subject} />
      {/if}
    </div>
  {/if}
  <div class="min-h-[calc(var(--text-shell--line-height)*5)]">
    {#if shown === undefined}
      {#if asking}
        <Asking {subject} />
      {/if}
    {:else if drawn !== undefined}
      <AttachedPictures {attachments} picture="max-h-48" />
      {#if !blank}
        <pre
          bind:this={written}
          class="font-shell break-words whitespace-pre-wrap">{drawn}</pre>
      {/if}
      <AttachedLines {attachments} ruled={!blank} />
      {#if shown.kind === "previewed" && shown.note !== undefined}
        <div class="mt-2 break-words">{shown.note}</div>
      {/if}
      {#if cut || (shown.kind === "previewed" && shown.content?.truncated === true && !cut)}
        <div class="flex justify-end">
          {#if cut}
            <button
              type="button"
              onclick={() => void unclamp()}
              class="hover:underline">more ▾</button
            >
          {:else}
            <span>shown in part</span>
          {/if}
        </div>
      {/if}
    {:else if said !== undefined}
      <span role="status" class={shown.kind === "rejected" ? "text-alarm" : ""}
        >{said}</span
      >
    {/if}
  </div>
</div>
