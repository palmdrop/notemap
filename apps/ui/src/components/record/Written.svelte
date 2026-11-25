<script lang="ts">
  import { untrack } from "svelte";
  import {
    Refused,
    saidBy,
    saidOf,
    type Item,
    type RoutingRecord,
  } from "@notemap/client";

  import AttachedLines from "$components/item/AttachedLines.svelte";
  import AttachedPictures from "$components/item/AttachedPictures.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { client } from "$lib/client";
  import { keepOutput, outputOf } from "$lib/outputs";
  import { NOTHING_KEPT, OUTPUT_UNREADABLE } from "$lib/said";

  /**
   * What a delivery wrote, exactly as it was sent and not rendered: the
   * output where a copy was kept, the words it carried in place of the
   * capture's where none was, and the item's own attachments around it.
   */
  let { record, held }: { record: RoutingRecord; held?: Item } = $props();

  const target = $derived(record.target);
  const byHand = $derived(target.kind === "user");
  const attachments = $derived(
    held === undefined ? [] : client.attachments(held),
  );

  let output = $state<string | undefined>(
    untrack(() => outputOf(record.id) ?? undefined),
  );
  let reading = $state(false);
  let unreadable = $state("");

  // A page reused across a change of record would otherwise draw what the
  // last one sent.
  $effect(() => {
    output = outputOf(record.id) ?? undefined;
    unreadable = "";
  });

  const kept = $derived(record.output?.content !== undefined);

  $effect(() => {
    if (!kept || output !== undefined || unreadable !== "" || reading) return;
    void read();
  });

  async function read(): Promise<void> {
    const asked = record.id;
    reading = true;
    unreadable = "";
    try {
      const bytes = await client.routing.output(asked);
      keepOutput(asked, bytes);
      if (asked === record.id) output = bytes;
    } catch (error) {
      if (asked !== record.id) return;
      unreadable =
        error instanceof Refused && error.code === "no-output"
          ? NOTHING_KEPT
          : `${OUTPUT_UNREADABLE} ${saidBy(error)}`;
    } finally {
      reading = false;
    }
  }

  const body = $derived(
    output ??
      (target.kind === "destination" && target.content !== undefined
        ? saidOf(target.content)
        : undefined),
  );
</script>

{#if !byHand}
  <div class="px-gutter py-4">
    <AttachedPictures {attachments} picture="max-h-48" />
    {#if body !== undefined}
      <pre
        class="m-0 rounded-control border border-tag-line bg-tag px-4 py-3 font-text break-words whitespace-pre-wrap">{body}</pre>
    {:else if unreadable !== ""}
      <p role="status" class="m-0">{unreadable}</p>
      {#if unreadable !== NOTHING_KEPT}
        <div class="mt-2">
          <Box icon="refresh" working={reading} onclick={() => void read()}
            >Read it again</Box
          >
        </div>
      {/if}
    {:else if kept}
      <Asking />
    {:else}
      <p class="m-0 text-muted">{NOTHING_KEPT}</p>
    {/if}
    <AttachedLines {attachments} ruled={body !== undefined} />
  </div>
{/if}
