<script lang="ts">
  import { onMount, untrack } from "svelte";

  import Action from "$components/primitives/controls/Action.svelte";
  import { commits } from "$lib/command/keys";
  import { publish } from "$lib/command/stack.svelte";
  import { aboutItem } from "$lib/excerpt";
  import { slide } from "$lib/motion";
  import { answer, opened, question, type Open } from "$lib/leaving.svelte";

  import AttachmentLine from "./AttachmentLine.svelte";
  import type { Editing } from "./editing.svelte";

  let { editing }: { editing: Editing } = $props();

  const id = $props.id();

  let field = $state<HTMLTextAreaElement | undefined>(undefined);

  // Drawn inside whatever surface opened it, so its `esc` is reached first.
  publish(() => [
    { id: "close", label: "close", run: () => editing.close() },
    {
      id: "save",
      label: "save",
      whileWriting: true,
      run: () => void editing.save(),
    },
  ]);

  const self: Open = {
    about: aboutItem(untrack(() => editing.item)),
    changed: () => editing.changed,
    save: () => editing.save(),
    revert: () => editing.abandon(),
    resume: () => {
      field?.scrollIntoView({ block: "nearest" });
      field?.focus();
    },
  };

  onMount(() => opened(self));

  /** Opened as a modal the moment it is drawn, with `save` taking the focus. */
  function modal(dialog: HTMLDialogElement): () => void {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-save] button")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }
</script>

<!-- The capture's own place, edited where it is read: the foot that saves it
     is the row's, drawn by `EditFoot` in place of the actions. -->
{#if editing.attachments.length > 0}
  <div class="flex flex-col" transition:slide={{ fade: true }}>
    {#each editing.attachments as held (held.asset)}
      <div class="flex items-end gap-4 pb-2" transition:slide={{ fade: true }}>
        {#if held.image}
          <img
            src={held.url}
            alt="What it carries"
            class="size-21 border border-ink object-cover"
          />
        {/if}
        <span class="min-w-0">
          <AttachmentLine name={held.name} url={held.url} bytes={held.bytes} />
        </span>
        <button
          type="button"
          onclick={() => editing.drop(held.asset)}
          aria-label={`remove ${held.name}`}
          class="shrink-0 hover:underline"
        >
          ×
        </button>
      </div>
    {/each}
  </div>
{/if}

<!-- svelte-ignore a11y_autofocus -->
<textarea
  bind:this={field}
  bind:value={editing.text}
  autofocus
  onkeydown={(event) => {
    if (commits(event)) {
      event.preventDefault();
      void editing.save();
    }
  }}
  aria-label="What it says"
  class="block min-h-[88px] w-full resize-y bg-transparent outline-none max-narrow:min-h-[72px]"
></textarea>

<!-- Asked wherever the row has scrolled to, so it says which capture. `esc`,
     the backdrop and a close nobody answered all stay. -->
{#if question.about === self}
  <dialog
    {@attach modal}
    aria-label="Unsaved changes"
    aria-describedby="{id}-about"
    oncancel={(event) => {
      event.preventDefault();
      void answer("stay");
    }}
    onclose={() => void answer("stay")}
    onclick={(event) => {
      if (event.target === event.currentTarget) void answer("stay");
    }}
    class="m-auto w-[min(28rem,calc(100vw-2rem))] border border-ink bg-ground p-0 text-ink backdrop:bg-ground/70"
  >
    <p id="{id}-about" class="px-3 py-2.5 wrap-anywhere">
      unsaved changes to {self.about}
    </p>
    <div
      class="flex items-baseline justify-between border-t border-ink px-3 leading-8"
    >
      <Action onclick={() => void answer("stay")}>keep editing</Action>
      <span class="flex items-baseline gap-x-5">
        <Action onclick={() => void answer("revert")}>revert</Action>
        <span data-save class="contents">
          <Action primary onclick={() => void answer("save")}>save</Action>
        </span>
      </span>
    </div>
  </dialog>
{/if}
