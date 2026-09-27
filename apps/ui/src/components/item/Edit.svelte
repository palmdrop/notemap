<script lang="ts">
  import { onMount, tick } from "svelte";

  import Action from "$components/primitives/controls/Action.svelte";
  import { commits } from "$lib/command/keys";
  import { publish } from "$lib/command/stack.svelte";
  import { aboutItem } from "$lib/excerpt";
  import { answer, opened, question } from "$lib/leaving.svelte";

  import type { Editing } from "./editing.svelte";

  let { editing }: { editing: Editing } = $props();

  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  let asking = $state<HTMLDialogElement | undefined>(undefined);

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

  onMount(() =>
    opened({
      about: aboutItem(editing.item),
      changed: () => editing.changed,
      save: () => editing.save(),
      revert: () => editing.abandon(),
      resume: () => {
        field?.scrollIntoView({ block: "nearest" });
        field?.focus();
      },
    }),
  );

  $effect(() => {
    if (asking === undefined) return;
    if (question.asked && !asking.open) {
      asking.showModal();
      void tick().then(() =>
        asking?.querySelector<HTMLElement>("[data-first] button")?.focus(),
      );
    }
    if (!question.asked && asking.open) asking.close();
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
  bind:this={field}
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

<!-- Asked wherever the row has scrolled to, so it says which capture. `esc`
     and the backdrop stay. -->
<dialog
  bind:this={asking}
  aria-label="Unsaved changes"
  oncancel={(event) => {
    event.preventDefault();
    answer("stay");
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) answer("stay");
  }}
  class="m-auto w-[min(28rem,calc(100vw-2rem))] border border-ink bg-ground p-0 text-ink backdrop:bg-ground/70"
>
  <p class="px-3 py-2.5 wrap-anywhere">
    unsaved changes to {question.about}
  </p>
  <div
    class="flex items-baseline justify-between border-t border-ink px-3 leading-8"
  >
    <Action onclick={() => answer("stay")}>keep editing</Action>
    <span class="flex items-baseline gap-x-5">
      <Action onclick={() => answer("revert")}>revert</Action>
      <span data-first class="contents">
        <Action primary onclick={() => answer("save")}>save</Action>
      </span>
    </span>
  </div>
</dialog>
