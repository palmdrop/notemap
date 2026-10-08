<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import HeldAttachment from "$components/item/HeldAttachment.svelte";
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
  import { NOTHING_TO_CAPTURE } from "$lib/said";
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
  const previews = new SvelteMap<File, string>();

  /** Pictures above the field and every other file under it, as a capture is read. */
  const pictures = $derived(
    chosen.filter((file) => isImage({ mime: file.type })),
  );
  const files = $derived(
    chosen.filter((file) => !isImage({ mime: file.type })),
  );

  // One URL per file for as long as the file is held, so adding or dropping
  // one leaves every other thumbnail where it is.
  $effect(() => {
    const held = chosen;
    untrack(() => {
      for (const file of held) {
        if (!previews.has(file)) previews.set(file, URL.createObjectURL(file));
      }
      for (const [file, url] of previews) {
        if (held.includes(file)) continue;
        URL.revokeObjectURL(url);
        previews.delete(file);
      }
    });
  });

  onDestroy(() => {
    for (const url of previews.values()) URL.revokeObjectURL(url);
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

  /** The files the pool would take, and what it would say of the ones it would not, by name. */
  function sorted(offered: readonly File[]): {
    readonly taken: readonly File[];
    readonly said: string;
  } {
    const refusals = offered
      .map((file) => ({ file, refusal: client.refuses(file) }))
      .filter((each) => each.refusal !== undefined);
    const [first] = refusals;
    return {
      taken: offered.filter((file) => client.refuses(file) === undefined),
      said:
        first?.refusal === undefined
          ? ""
          : `${refusals.map((each) => each.file.name).join(", ")}: ${saidBy(first.refusal)}`,
    };
  }

  function pick(event: Event) {
    const picked = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    picker.value = "";

    const { taken, said: refused } = sorted(picked);
    said = refused;
    chosen = [...chosen, ...taken];
  }

  function drop(file: File) {
    chosen = chosen.filter((one) => one !== file);
  }

  async function capture() {
    if (chosen.length === 0 && text.trim() === "") {
      said = NOTHING_TO_CAPTURE;
      return;
    }

    // The limit may have been learned since a file was picked, or a refused
    // capture put back with the file that was refused.
    const { taken, said: refused } = sorted(chosen);
    if (refused !== "") {
      chosen = taken;
      said = refused;
      return;
    }

    busy = true;
    said = "";
    // Held rather than uploaded: the bytes go up when the capture drains. Bytes
    // held for a capture that is then never made are let go of, since nothing
    // else would.
    const assets: string[] = [];
    try {
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
      for (const asset of assets) await client.detach(asset).catch(() => {});
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
  {#if pictures.length > 0}
    <div
      class="flex flex-col border-b border-ink px-3 pt-2.5 pb-0.5"
      transition:slide={{ fade: true }}
    >
      {#each pictures as file (file)}
        <HeldAttachment
          name={file.name}
          url={previews.get(file)}
          bytes={file.size}
          picture
          ondrop={() => drop(file)}
        />
      {/each}
    </div>
  {/if}

  <textarea
    bind:this={box}
    bind:value={text}
    oninput={() => {
      if (said === NOTHING_TO_CAPTURE) said = "";
    }}
    onkeydown={(event) => {
      if (commits(event)) {
        event.preventDefault();
        void capture();
      }
    }}
    aria-label="What to capture"
    class="block min-h-[88px] w-full resize-y bg-transparent px-3 py-2.5 outline-none max-narrow:min-h-[72px]"
  ></textarea>

  {#if files.length > 0}
    <div class="flex flex-col px-3 pb-0.5" transition:slide={{ fade: true }}>
      {#each files as file (file)}
        <HeldAttachment
          name={file.name}
          url={previews.get(file)}
          bytes={file.size}
          ondrop={() => drop(file)}
        />
      {/each}
    </div>
  {/if}

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
          <!-- Only a failure or an empty box reaches this: the capture itself waits on nothing. -->
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
