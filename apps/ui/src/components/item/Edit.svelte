<script lang="ts">
  import { commits } from "$lib/command/keys";
  import { publish } from "$lib/command/stack.svelte";

  import type { Rewrite } from "./rewrite.svelte";

  let { rewrite }: { rewrite: Rewrite } = $props();

  // Drawn inside whatever surface opened it, and holding it: the draft is
  // left by `cancel` or `save` before anything else on the item is reached.
  publish(
    () => [
      { id: "cancel", label: "cancel", run: () => rewrite.cancel() },
      {
        id: "save",
        label: "save",
        whileWriting: true,
        run: () => rewrite.save(),
      },
    ],
    { holds: true },
  );
</script>

<!-- The capture's own place, rewritten where it is read: the foot that saves
     it is the row's, drawn by `EditFoot` in place of the actions. -->
{#if rewrite.picture !== undefined}
  <div class="mb-2 flex items-end gap-4">
    {#if rewrite.picture.image}
      <img
        src={rewrite.picture.url}
        alt="What it carries"
        class="size-21 border border-ink object-cover"
      />
    {/if}
    <span class="min-w-0 break-words">{rewrite.picture.name}</span>
    <button
      type="button"
      onclick={() => rewrite.drop()}
      class="shrink-0 hover:underline"
    >
      drop
    </button>
  </div>
{/if}

<!-- svelte-ignore a11y_autofocus -->
<textarea
  bind:value={rewrite.text}
  autofocus
  onkeydown={(event) => {
    if (commits(event)) {
      event.preventDefault();
      rewrite.save();
    }
  }}
  aria-label="What it says"
  class="block min-h-[88px] w-full resize-y bg-transparent outline-none max-narrow:min-h-[72px]"
></textarea>
