<script lang="ts">
  import { timeOf } from "$lib/stamp";
  import { onDestroy, onMount, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import { saidBy } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import HeldAttachment from "$components/item/HeldAttachment.svelte";
  import { askingFor, saidFor, type Supplied } from "$lib/asked";
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
  import {
    bringIntoView,
    markingHidden,
    settled,
    showingNewest,
    slide,
  } from "$lib/motion";
  import { sorted } from "$lib/picking";
  import { receives } from "$lib/receiving.svelte";
  import { NOTHING_TO_CAPTURE } from "$lib/said";
  import { fade } from "$lib/motion";
  import { offerable, triggeredBy } from "$lib/templates";

  let {
    focus = true,
    selected = false,
    form: drawn = "box",
    onfocus,
    oncaptured,
    told,
  }: {
    /**
     * Whether the field takes the caret as it is drawn: the page's does, and the
     * queue's box leaves the keys to the rows.
     */
    focus?: boolean;
    /** The box is the queue's head, and selected as a row is: one of them at a time. */
    selected?: boolean;
    /**
     * `box` is the head of the queue on a wide window; `page` is the capture
     * page a phone opens from its +, its bar docked at its foot.
     */
    form?: "box" | "page";
    /** Anything in the box took the focus, which selects it. */
    onfocus?: () => void;
    /** Sent, with the item it made: for saying where it landed. */
    oncaptured?: (item: string) => void;
    /** What the page has to say over the bar, where the box itself has nothing to: what a share added. */
    told?: { readonly words: string; readonly alarm?: boolean };
  } = $props();

  // Read where the box is drawn, so coming back from another surface restores
  // it the same way a reload does.
  const held = readDraft();
  /** Something was left here when the page was last closed, said once with Clear. */
  let kept = $state(
    held.text.trim() !== "" || held.tags.length > 0 || heldFiles().length > 0,
  );
  let text = $state(held.text);
  let tags = $state<string[]>([...held.tags]);
  /** By trigger tag, the values given for what its template asks. */
  let given = $state<Record<string, Supplied>>({ ...held.arguments });
  let chosen = $state<readonly File[]>(heldFiles());
  let busy = $state(false);
  let said = $state("");
  let picker: HTMLInputElement;
  let camera = $state<HTMLInputElement | undefined>(undefined);
  const empty = $derived(chosen.length === 0 && text.trim() === "");

  /**
   * The box is the head of the queue, so it reads as a row about to be: the
   * time it would be stamped with now, in the rows' time column.
   */
  let now = $state(new Date().toISOString());
  $effect(() => {
    if (drawn === "page") return;
    const ticking = setInterval(() => {
      now = new Date().toISOString();
    }, 10_000);
    return () => clearInterval(ticking);
  });
  let box = $state<HTMLTextAreaElement | undefined>(undefined);
  let form = $state<HTMLFormElement | undefined>(undefined);
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

  // One URL per file for as long as the file is held, so adding or removing
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
    const kept = Object.fromEntries(
      Object.entries(given).filter(([tag]) => tags.includes(tag)),
    );
    writeDraft(
      Object.keys(kept).length === 0
        ? { text, tags }
        : { text, tags, arguments: kept },
    );
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
      given = { ...back.arguments };
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
    const input = event.currentTarget as HTMLInputElement;
    const picked = [...(input.files ?? [])];
    input.value = "";
    add(picked);
  }

  function add(files: readonly File[]) {
    const { taken, said: refused } = sorted(files);
    said = refused;
    chosen = [...chosen, ...taken];
  }

  // Dropped or pasted from anywhere on the queue, which may be scrolled far
  // from the box the files land in.
  onMount(() =>
    receives({
      name: "the capture",
      edit: false,
      busy: () => busy,
      owns: (target) => target === box,
      take: (files) => {
        add(files);
        if (form === undefined) return;
        const growing = form;
        void settled(growing).then(() => {
          bringIntoView(growing, { headFirst: true });
        });
      },
    }),
  );

  /** Starts over: what was kept from last time goes. */
  function clear(): void {
    text = "";
    tags = [];
    given = {};
    chosen = [];
    clearDraft();
    kept = false;
    box?.focus();
  }

  /** What a trigger tag on it will do once it is sent. */
  const routes = $derived(
    tags
      .map((name) => ({ name, template: triggeredBy(name) }))
      .find((one) => one.template !== undefined),
  );

  function remove(file: File) {
    chosen = chosen.filter((one) => one !== file);
  }

  async function capture() {
    if (chosen.length === 0 && text.trim() === "") {
      said = NOTHING_TO_CAPTURE;
      return;
    }

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
      const values = Object.fromEntries(
        Object.entries($state.snapshot(given)).filter(([tag]) =>
          sent.includes(tag),
        ),
      );
      const item = await client.capture({
        channel: WEB,
        text,
        ...(assets.length === 0 ? {} : { assets }),
        ...(sent.length === 0 ? {} : { tags: sent }),
        ...(Object.keys(values).length === 0 ? {} : { arguments: values }),
      });

      text = "";
      tags = [];
      given = {};
      chosen = [];
      clearDraft();
      kept = false;

      for (const name of sent) void sayItFired(item.id, name);
      oncaptured?.(item.id);
    } catch (error) {
      said = saidBy(error);
      for (const asset of assets) await client.detach(asset).catch(() => {});
    } finally {
      busy = false;
    }
  }
</script>

{#snippet pictured()}
  {#if pictures.length > 0}
    <div
      class="flex max-h-76 flex-col overflow-y-auto border-b border-transparent px-3 pt-2.5 pb-0.5 transition-[border-color] duration-(--duration-short) ease-fade data-hidden-below:border-rule"
      transition:slide={{ fade: true }}
      {@attach showingNewest}
      {@attach markingHidden}
    >
      {#each pictures as file (file)}
        <HeldAttachment
          name={file.name}
          url={previews.get(file)}
          bytes={file.size}
          picture
          onremove={() => remove(file)}
        />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet filed()}
  {#if files.length > 0}
    <div
      class="flex max-h-44 flex-col overflow-y-auto border-t border-transparent px-3 pb-0.5 transition-[border-color] duration-(--duration-short) ease-fade data-hidden-above:border-rule"
      transition:slide={{ fade: true }}
      {@attach showingNewest}
      {@attach markingHidden}
    >
      {#each files as file (file)}
        <HeldAttachment
          name={file.name}
          url={previews.get(file)}
          bytes={file.size}
          onremove={() => remove(file)}
        />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet field(placeholder: string | undefined, page: boolean)}
  <textarea
    bind:this={box}
    bind:value={text}
    {placeholder}
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
    class="block w-full resize-y bg-transparent px-gutter py-3 outline-none {page
      ? 'min-h-24 flex-1 resize-none'
      : 'min-h-[88px] wide:pl-words'}"></textarea>
{/snippet}

{#snippet tagged()}
  <span class="relative flex min-w-0 flex-wrap items-center gap-1">
    <TagSet
      bind:this={chooser}
      names={tags}
      {offered}
      label="Tag the capture"
      fires={(name) => triggeredBy(name)?.name}
      ask={askingFor}
      besides={(name) => saidFor(name, given[name])}
      onadd={(name, supplied) => {
        tags = [...tags, name];
        if (supplied !== undefined) given = { ...given, [name]: supplied };
      }}
      onremove={(name) => {
        tags = tags.filter((one) => one !== name);
        const { [name]: _dropped, ...rest } = given;
        given = rest;
      }}
    />
  </span>
  {#if routes?.template !== undefined}
    <p class="flex items-center gap-1.5 text-small text-muted" transition:fade>
      <Icon name="route" class="size-4" />
      <span
        >Routes by <b class="text-ink">{routes.template.name}</b
        >{#if saidFor(routes.name, given[routes.name]) !== undefined}, {saidFor(
            routes.name,
            given[routes.name],
          )}{/if} once it is sent</span
      >
    </p>
  {/if}
{/snippet}

{#snippet picking()}
  <input
    bind:this={picker}
    type="file"
    multiple
    onchange={pick}
    aria-label="Files to capture"
    class="hidden"
  />
  {#if drawn === "page"}
    <input
      bind:this={camera}
      type="file"
      accept="image/*"
      capture="environment"
      onchange={pick}
      aria-label="Take a picture"
      class="hidden"
    />
  {/if}
{/snippet}

{#if drawn === "page"}
  <!-- The capture page: titled by the header, no placeholder and no clock,
       since it is stamped when it is sent. -->
  <form
    bind:this={form}
    onsubmit={(event) => {
      event.preventDefault();
      void capture();
    }}
    class="-mx-3.5 flex min-h-0 flex-1 flex-col"
  >
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {#if kept}
        <p
          class="flex items-center gap-3 border-b border-rule bg-tag px-gutter py-2 text-small"
          transition:fade
        >
          <span class="flex-1">Draft kept from last time.</span>
          <button
            type="button"
            class="underline underline-offset-[0.2em]"
            onclick={clear}>Clear</button
          >
        </p>
      {/if}
      {@render pictured()}
      {@render field(undefined, true)}
      {@render filed()}
      <div class="flex flex-col gap-2 px-gutter pb-3">
        {@render tagged()}
      </div>
    </div>
    <ActionBar label="Capture">
      {#snippet say()}{#if said !== ""}<span
            role="status"
            class={said === NOTHING_TO_CAPTURE ? "" : "text-danger"}
            >{said === NOTHING_TO_CAPTURE
              ? "Nothing to capture yet: write something, or attach a file."
              : said}</span
          >{:else if told !== undefined}<span
            role="status"
            class={told.alarm === true ? "text-danger" : ""}>{told.words}</span
          >{/if}{/snippet}
      <BarAction
        icon="attach"
        label="Attach"
        disabled={busy}
        onclick={() => picker.click()}
      />
      <BarAction
        icon="camera"
        label="Camera"
        disabled={busy}
        onclick={() => camera?.click()}
      />
      <BarAction
        icon="check"
        label="Save"
        primary
        working={busy}
        why={empty ? "Write something, or attach a file." : undefined}
        command="capture"
        onclick={() => void capture()}
        onrefused={() => (said = NOTHING_TO_CAPTURE)}
      />
    </ActionBar>
    {@render picking()}
  </form>
{:else}
  <!-- The head of the queue on a wide window. Lifted while its tag offer is
       open, which hangs over the rows beneath it. -->
  <form
    bind:this={form}
    onsubmit={(event) => {
      event.preventDefault();
      void capture();
    }}
    onfocusin={() => onfocus?.()}
    data-selected={selected ? "" : undefined}
    class="-mx-8 border-b border-rule has-[.offer]:relative has-[.offer]:z-50 max-wide:-mx-3.5"
  >
    {@render pictured()}
    <div class="relative">
      <span
        aria-hidden="true"
        data-now
        class="pointer-events-none absolute top-3 left-gutter hidden text-time text-muted tabular-nums wide:block"
        >{timeOf(now)}</span
      >
      {@render field("Write, or attach…", false)}
    </div>
    {@render filed()}
    <div class="flex flex-wrap items-center gap-2 px-gutter pb-3 wide:pl-words">
      <Box icon="attach" disabled={busy} onclick={() => picker.click()}
        >Attach</Box
      >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        {@render tagged()}
      </div>
      {#if said !== ""}
        <span
          role="status"
          class="text-small {said === NOTHING_TO_CAPTURE ? '' : 'text-danger'}"
        >
          {said}
        </span>
      {/if}
      <span class="text-small text-muted">Ctrl+Enter</span>
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy || undefined}
        class="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-ink bg-ink px-3.5 text-paper"
      >
        <Icon name="capture" class="size-[1.125rem]" />
        Capture
      </button>
    </div>
    {@render picking()}
  </form>
{/if}
