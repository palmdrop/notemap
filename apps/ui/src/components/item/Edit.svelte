<script lang="ts">
  import { commits } from "$lib/command/keys";
  import { publish } from "$lib/command/stack.svelte";

  import type { Editing } from "./editing.svelte";

  let { editing }: { editing: Editing } = $props();

  // Drawn inside whatever surface opened it, so its `esc` is reached first.
  publish(() => [
    { id: "close", label: "close", run: () => editing.close() },
    {
      id: "save",
      label: "save",
      whileWriting: true,
      run: () => editing.save(),
    },
  ]);

  $effect(() => {
    editing.keep();
  });
</script>

<!-- The capture's own place, edited where it is read: the foot that saves it
     is the row's, drawn by `EditFoot` in place of the actions. -->
{#if editing.picture !== null}
  <div class="mb-2 flex items-end gap-4">
    {#if editing.picture.image}
      <img
        src={editing.picture.url}
        alt="What it carries"
        class="size-21 border border-ink object-cover"
      />
    {/if}
    <span class="min-w-0 break-words">{editing.picture.name}</span>
    <button
      type="button"
      onclick={() => editing.drop()}
      class="shrink-0 hover:underline"
    >
      drop
    </button>
  </div>
{/if}

<!-- svelte-ignore a11y_autofocus -->
<textarea
  bind:value={editing.text}
  autofocus
  onkeydown={(event) => {
    if (commits(event)) {
      event.preventDefault();
      editing.save();
    }
  }}
  aria-label="What it says"
  class="block min-h-[88px] w-full resize-y bg-transparent outline-none max-narrow:min-h-[72px]"
></textarea>
