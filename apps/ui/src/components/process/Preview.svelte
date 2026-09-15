<script lang="ts">
  import type { RoutingPreview } from "@notemap/client";

  import {
    NO_PREVIEW_OFFERED,
    PREVIEW_NOT_TEXT,
    PREVIEW_UNREACHABLE,
  } from "$lib/said";

  /**
   * The head of the file the destination would write, in a ruled block: five
   * lines, and the rest behind `more`. A destination that offers no preview,
   * or that cannot be reached, says so in the block in plain ink — neither is
   * a failure of the decision. `place` is the full path above it, bold, so
   * the block says both where and what.
   */
  let { shown, place }: { shown: RoutingPreview; place?: string } = $props();

  const LINES = 5;

  let whole = $state(false);

  const text = $derived(
    shown.kind === "previewed" ? shown.content?.text : undefined,
  );

  const lines = $derived(text?.split("\n") ?? []);
  const cut = $derived(!whole && lines.length > LINES);
  const drawn = $derived(cut ? lines.slice(0, LINES).join("\n") : text);

  const said = $derived.by(() => {
    switch (shown.kind) {
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
  {#if place !== undefined}
    <div class="mb-2 border-b border-ink pb-2 font-semibold break-words">
      {place}
    </div>
  {/if}
  {#if drawn !== undefined}
    <pre class="font-shell break-words whitespace-pre-wrap">{drawn}</pre>
    {#if shown.kind === "previewed" && shown.note !== undefined}
      <div class="mt-2 break-words">{shown.note}</div>
    {/if}
    {#if cut || (shown.kind === "previewed" && shown.content?.truncated === true && !cut)}
      <div class="flex justify-end">
        {#if cut}
          <button
            type="button"
            onclick={() => (whole = true)}
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
