<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import AttachmentLine from "$components/item/AttachmentLine.svelte";
  import { isImage } from "$lib/attachments";
  import { WEB } from "$lib/channels";
  import { client } from "$lib/client";
  import {
    clearDraft,
    heldFiles,
    holdFiles,
    onRestored,
    readDraft,
    writeDraft,
  } from "$lib/draft";
  import { sayItFired } from "$lib/firing";
  import { commits } from "$lib/command/keys";
  import { slide } from "$lib/motion";
  import { offerable, triggeredBy } from "$lib/templates";

  let {
    focus = true,
    selected = false,
    onfocus,
  }: {
    /**
     * Whether the field takes the caret when the queue is drawn. Not on the way
     * back from processing with a row still selected: the keys are the row's then.
     */
    focus?: boolean;
    /** The box is the queue's head, and selected as a row is: one of them at a time. */
    selected?: boolean;
    /** Anything in the box took the focus, which selects it. */
    onfocus?: () => void;
  } = $props();

  // Read where the box is drawn, so coming back from another surface restores
  // it the same way a reload does.
  const held = readDraft();
  let text = $state(held.text);
  let tags = $state<string[]>([...held.tags]);
  let chosen = $state<readonly File[]>(heldFiles());
  let busy = $state(false);
  let said = $state("");
  let picker: HTMLInputElement;
  let box = $state<HTMLTextAreaElement | undefined>(undefined);
  let chooser = $state<TagSet | undefined>(undefined);

  /** Gives the field the caret, for the key that goes back into it. */
  export function take(): void {
    box?.focus();
  }

  /** Opens the tag chooser, for the key that asks for it. */
  export function tag(): void {
    chooser?.add();
  }

  /** Commits what the box holds, for the chord that reaches it from outside the field. */
  export function commit(): void {
    void capture();
  }

  /**
   * The bytes as the browser can draw them, one per file in the order picked.
   * An attachment goes up with the capture and cannot be taken back once it
   * has, so it is looked at before it is sent rather than recognised
   * afterwards in the feed.
   */
  let previews = $state<readonly string[]>([]);

  $effect(() => {
    const urls = chosen.map((file) => URL.createObjectURL(file));
    previews = urls;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  });

  // The queue is where capture happens, and this is the head of it.
  $effect(() => {
    if (focus) box?.focus();
  });

  $effect(() => {
    writeDraft({ text, tags });
  });

  $effect(() => {
    holdFiles(chosen);
  });

  // A refused capture put back while the box is drawn.
  $effect(() =>
    onRestored(() => {
      const back = readDraft();
      text = back.text;
      tags = [...back.tags];
      chosen = heldFiles();
    }),
  );

  const inUse = client.tags.inUse;
  const templates = client.templates.all;
  const offered = $derived(
    offerable(
      $inUse.map((use) => use.name),
      $templates,
    ),
  );

  function pick(event: Event) {
    const picked = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    picker.value = "";

    const refusal = picked
      .map((file) => client.refuses(file))
      .find((refused) => refused !== undefined);
    said = refusal === undefined ? "" : saidBy(refusal);
    chosen = [
      ...chosen,
      ...picked.filter((file) => client.refuses(file) === undefined),
    ];
  }

  function drop(file: File) {
    chosen = chosen.filter((one) => one !== file);
  }

  async function capture() {
    if (chosen.length === 0 && text.trim() === "") return;

    busy = true;
    said = "";
    try {
      // Held rather than uploaded: the bytes go up when the capture drains.
      const assets = [];
      for (const file of chosen) assets.push(await client.attach(file));

      const sent = [...tags];
      const item = await client.capture({
        channel: WEB,
        text,
        ...(assets.length === 0 ? {} : { assets }),
        ...(sent.length === 0 ? {} : { tags: sent }),
      });

      text = "";
      tags = [];
      chosen = [];
      clearDraft();

      for (const name of sent) void sayItFired(item.id, name);
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<!-- The one thing at the head of the queue that is boxed. No placeholder and no
     stamp: the box is the invitation, and the capture is stamped when it is
     sent. Lifted while its tag offer is open, which hangs over the list head
     beneath it, and not otherwise, so the notices panel still covers it. -->
<form
  onsubmit={(event) => {
    event.preventDefault();
    void capture();
  }}
  onfocusin={() => onfocus?.()}
  data-selected={selected ? "" : undefined}
  class="mt-6 border border-ink has-[.offer]:relative has-[.offer]:z-50"
>
  {#if chosen.length > 0}
    <div
      class="flex flex-col gap-2 border-b border-ink px-3 py-2.5"
      transition:slide={{ fade: true }}
    >
      {#each chosen as file, at (file)}
        <div class="flex items-end gap-4">
          {#if isImage({ mime: file.type })}
            <!-- The picture's room is there before the picture is, so the
                 section opens to the height it keeps. -->
            <div class="size-21 shrink-0 border border-ink">
              {#if previews[at] !== undefined}
                <img
                  src={previews[at]}
                  alt="What is about to be captured"
                  class="size-full object-cover"
                />
              {/if}
            </div>
          {/if}
          <span class="min-w-0">
            <AttachmentLine
              name={file.name}
              url={previews[at] ?? ""}
              mime={file.type}
              bytes={file.size}
            />
          </span>
          <button
            type="button"
            onclick={() => drop(file)}
            aria-label={`remove ${file.name}`}
            class="shrink-0 hover:underline"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <textarea
    bind:this={box}
    bind:value={text}
    onkeydown={(event) => {
      if (commits(event)) {
        event.preventDefault();
        void capture();
      }
    }}
    aria-label="What to capture"
    class="block min-h-[88px] w-full resize-y bg-transparent px-3 py-2.5 outline-none max-narrow:min-h-[72px]"
  ></textarea>

  <div class="flex items-baseline justify-between border-t border-ink">
    <span class="flex items-baseline">
      <span class="border-r border-ink px-3 leading-8">
        <Action disabled={busy} onclick={() => picker.click()}>attach</Action>
      </span>

      <span class="flex items-baseline gap-x-4 px-3 leading-8">
        <span class="relative -ml-tag flex min-w-0 flex-wrap items-baseline">
          <TagSet
            bind:this={chooser}
            names={tags}
            {offered}
            label="Tag the capture"
            fires={(name) => triggeredBy(name)?.name}
            onadd={(name) => (tags = [...tags, name])}
            onremove={(name) => (tags = tags.filter((one) => one !== name))}
          />
        </span>

        {#if said !== ""}
          <!-- Only a failure reaches this: the capture itself waits on nothing. -->
          <span role="status" class="text-alarm">{said}</span>
        {/if}
      </span>
    </span>

    <span class="border-l border-ink px-3 leading-8">
      <Action primary submit working={busy}>capture</Action>
    </span>

    <input
      bind:this={picker}
      type="file"
      multiple
      onchange={pick}
      aria-label="Files to capture"
      class="hidden"
    />
  </div>
</form>
