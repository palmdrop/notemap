<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import Action from "$components/primitives/controls/Action.svelte";
  import { commits } from "$lib/command/keys";
  import { publish } from "$lib/command/stack.svelte";
  import { aboutItem } from "$lib/excerpt";
  import { markingHidden, showingNewest, slide } from "$lib/motion";
  import { answer, opened, question, type Open } from "$lib/leaving.svelte";
  import { receives } from "$lib/receiving.svelte";

  import HeldAttachment from "./HeldAttachment.svelte";
  import { isPicked, type Editing, type Held } from "./editing.svelte";

  let { editing }: { editing: Editing } = $props();

  const id = $props.id();

  const pictures = $derived(editing.attachments.filter((held) => held.image));
  const files = $derived(editing.attachments.filter((held) => !held.image));

  /**
   * The bytes of a picked file as the browser can draw them, the client holding
   * none of them until the edit is saved. One URL per file for as long as the
   * file is held, so adding or removing one leaves every other thumbnail where
   * it is.
   */
  const previews = new SvelteMap<File, string>();

  $effect(() => {
    const held = editing.attachments;
    untrack(() => {
      const picked = held.filter(isPicked).map((each) => each.file);
      for (const file of picked) {
        if (!previews.has(file)) previews.set(file, URL.createObjectURL(file));
      }
      for (const [file, url] of previews) {
        if (picked.includes(file)) continue;
        URL.revokeObjectURL(url);
        previews.delete(file);
      }
    });
  });

  onDestroy(() => {
    for (const url of previews.values()) URL.revokeObjectURL(url);
  });

  /** Stable for as long as the thing is held, which is what the lists are keyed on. */
  function keyOf(held: Held): string | File {
    return isPicked(held) ? held.file : held.asset;
  }

  function urlOf(held: Held): string | undefined {
    return isPicked(held) ? previews.get(held.file) : held.url;
  }

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

  onMount(() =>
    receives({
      name: self.about,
      edit: true,
      busy: () => editing.busy,
      owns: (target) => target === field,
      take: (files) => editing.pick(files),
    }),
  );

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
{#if pictures.length > 0}
  <!-- Ruled off from the words only while pictures lie past the edge they share. -->
  <div
    class="flex max-h-76 flex-col overflow-y-auto border-b border-transparent transition-[border-color] duration-(--duration-short) ease-fade data-hidden-below:border-ink"
    transition:slide={{ fade: true }}
    {@attach showingNewest}
    {@attach markingHidden}
  >
    {#each pictures as held (keyOf(held))}
      <HeldAttachment
        name={held.name}
        url={urlOf(held)}
        bytes={held.bytes}
        picture
        onremove={() => editing.remove(held)}
      />
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

<!-- Under the words behind the short rule, where the row being edited draws them. -->
{#if files.length > 0}
  <div class="group mt-2 flex flex-col" transition:slide={{ fade: true }}>
    <!-- The short rule spans the row while files lie past it. -->
    <div
      class="mb-1 w-12 border-t border-ink transition-[width] duration-(--duration-short) ease-fade group-has-data-hidden-above:w-full"
    ></div>
    <div
      class="flex max-h-44 flex-col overflow-y-auto"
      {@attach showingNewest}
      {@attach markingHidden}
    >
      {#each files as held (keyOf(held))}
        <HeldAttachment
          name={held.name}
          url={urlOf(held)}
          bytes={held.bytes}
          onremove={() => editing.remove(held)}
        />
      {/each}
    </div>
  </div>
{/if}

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
