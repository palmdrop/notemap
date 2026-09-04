<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";
  import Clamp from "$components/primitives/text/Clamp.svelte";

  /**
   * What a destination wrote, or says it would write. One component for both,
   * because they are one shape and reading them is one act: a person comparing
   * what went with what would go is holding the same thing twice.
   */
  let {
    heading = "output",
    /** What the destination could not carry, in its own words. */
    note,
    text,
    truncated = false,
    /** Why there is nothing to read, where that is the answer. */
    said = "",
    /** Present where the content is a fetch nobody has made yet. */
    onread,
    busy = false,
  }: {
    heading?: string;
    note?: string;
    text?: string;
    truncated?: boolean;
    said?: string;
    onread?: () => void;
    busy?: boolean;
  } = $props();
</script>

<div class="font-mono text-ink-muted">{heading}</div>

{#if note !== undefined}
  <div class="mt-2 break-words">{note}</div>
{/if}

{#if text !== undefined}
  <Clamp>
    <pre class="mt-2 font-mono break-words whitespace-pre-wrap">{text}</pre>
  </Clamp>
  {#if truncated}
    <div class="mt-1 font-mono text-ink-muted">shown in part</div>
  {/if}
{:else if onread !== undefined}
  <div class="mt-2">
    <Action disabled={busy} onclick={onread}>
      {busy ? "reading…" : "read it"}
    </Action>
  </div>
{:else if said !== ""}
  <div role="status" class="mt-2 font-mono text-ink-muted">{said}</div>
{/if}
