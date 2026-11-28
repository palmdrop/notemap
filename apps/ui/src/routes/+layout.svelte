<script lang="ts">
  import { untrack } from "svelte";
  import {
    afterNavigate,
    beforeNavigate,
    goto,
    onNavigate,
  } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Dropping from "$components/dropping/Dropping.svelte";
  import SignIn from "$components/session/SignIn.svelte";
  import Drawer from "$components/frame/Drawer.svelte";
  import Header from "$components/frame/Header.svelte";
  import ItemHead from "$components/item/ItemHead.svelte";
  import Quick from "$components/quick/Quick.svelte";
  import { quick } from "$lib/quicking.svelte";
  import Menu from "$components/frame/Menu.svelte";
  import Glance from "$components/frame/Glance.svelte";
  import Going from "$components/frame/Going.svelte";
  import Reach from "$components/frame/Reach.svelte";
  import Strip from "$components/frame/Strip.svelte";
  import Column from "$components/primitives/frame/Column.svelte";
  import Sprite from "$components/primitives/icon/Sprite.svelte";
  import Sheet from "$components/primitives/frame/Sheet.svelte";
  import StatusLine from "$components/status/StatusLine.svelte";
  import { width } from "$lib/breakpoint";
  import { client } from "$lib/client";
  import { chordFor } from "$lib/command/bindings";
  import { dispatch } from "$lib/command/dispatch";
  import { firings } from "$lib/firings.svelte";
  import { tallying } from "$lib/tallies";
  import { published } from "$lib/command/stack.svelte";
  import { leave, unsaved } from "$lib/leaving.svelte";
  import { notices } from "$lib/notices.svelte";
  import { reachable, watched } from "$lib/reachable.svelte";
  import { session } from "$lib/session.svelte";
  import { arrived } from "$lib/trail.svelte";
  import { watchVisible } from "$lib/visible";
  import {
    loadInstead,
    registerWorker,
    reload,
    watchVersion,
  } from "$lib/installed/version";
  import { newer, watchWorker } from "$lib/installed/newer.svelte";
  import { installed } from "$lib/installed/standalone";
  import { preloadSurfaces } from "$lib/preload";
  import { arriving } from "$lib/arrival";

  import "./layout.css";

  let { children } = $props();

  const pool = reachable();
  const who = session();

  watched();

  $effect(() => watchVisible());
  $effect(preloadSurfaces);

  $effect(() => {
    registerWorker();
  });

  $effect(() => watchVersion());
  $effect(() => watchWorker());

  $effect(() => {
    if (!newer.current) return;
    untrack(() =>
      notices.raise({
        what: "new version",
        offer: { label: "Reload", take: reload },
        key: "new-version",
      }),
    );
  });

  /** A move back or forward the browser has already made, which then loads the newer build where it went. */
  let loadOnArrival = false;

  onNavigate(({ type }) => arriving(type));

  afterNavigate(({ from, type }) => {
    arrived(type !== "enter" && from !== null);
    if (loadOnArrival) location.reload();
  });

  const queue = client.counts.queue;
  const outbox = client.outbox;
  const waiting = $derived(
    $outbox.filter((held) => held.state !== "refused").length,
  );

  /** The lists: searched, filtered, noticed, with the status line at their foot. */
  const LISTS = new Set(["/", "/feed", "/log"]);
  const list = $derived(LISTS.has(page.route.id ?? ""));

  const TITLES: Record<string, string> = {
    "/": "queue",
    "/feed": "feed",
    "/log": "log",
    "/capture": "capture",
    "/items/[id]": "item",
    "/items/[id]/process": "route",
    "/items/[id]/records/[recordId]": "record",
  };
  let drawer = $state(false);

  // Read whenever the pool is in reach and the door is open: a read refused
  // at start would otherwise leave completion offering nothing until a tag
  // happened to drain, and a pool setting changed on another device has to
  // arrive without anyone opening settings. A failure is swallowed, the status
  // line and the login being what say so.
  $effect(() => {
    if (pool.yes && !who.shut) {
      void client.destinations.load().catch(() => undefined);
      void client.templates.load().catch(() => undefined);
      void client.tags.load().catch(() => undefined);
      void client.settings.load().catch(() => undefined);
      void client.counts.load().catch(() => undefined);
    }
  });

  // The cache holds the pool's items and the door is shut; drawing them because
  // they happen to be local would make signing out mean nothing. What is still
  // said is how much unsent work is held, because that is the person's and its
  // loss would otherwise be silent.
  const shut = $derived(who.shut);

  // An installed shell still takes a capture behind the door, held until
  // someone signs in: it is the one page drawing nothing of the pool's.
  const signIn = $derived(
    shut && !(page.route.id === "/capture" && installed()),
  );

  const title = $derived(
    signIn
      ? "sign in"
      : (TITLES[page.route.id ?? ""] ??
          (page.route.id?.startsWith("/settings") === true
            ? "settings"
            : "notemap")),
  );

  /** The one surface that takes the window when wide. */
  const takesWindow = $derived(page.route.id === "/items/[id]/process");
  /** Frames rather than pages: head and foot held, the middle scrolling. */
  const fills = $derived(takesWindow || page.route.id === "/capture");

  /** Pages drawn edge to edge in ruled rows, their own padding inside them. */
  const BLEEDS = new Set([
    "/items/[id]/process",
    "/items/[id]/records/[recordId]",
    "/settings/[section]",
    "/settings",
  ]);
  const bleeds = $derived(BLEEDS.has(page.route.id ?? ""));
  /** The menu column, when wide, everywhere but a route being made. */
  const menued = $derived(width.wide && !shut && !takesWindow);

  // Signing out is the pool's work leaving with it. A failure about a
  // delivery nobody can now look up would outlive the session that raised it.
  $effect(() => {
    if (!shut) return;
    untrack(() => {
      notices.clear();
      firings.clear();
      tallying.clear();
    });
  });

  // An edit with changes is asked about before the page goes: in the shell's
  // own words within the app, and in the browser's when the tab is left.
  // Asked, the navigation goes on the way it would have: back and forward move
  // through history, and a link out of the app is left to the browser.
  beforeNavigate((navigation) => {
    if (!unsaved()) {
      // A newer build is kept: this move loads it, rather than moving
      // within the old one.
      const instead = loadInstead(newer.current, navigation);
      if (instead === undefined) return;
      if (navigation.type === "popstate") {
        loadOnArrival = true;
      } else {
        navigation.cancel();
        location.assign(instead.href);
      }
      return;
    }
    navigation.cancel();
    const { type, to, delta, willUnload } = navigation;
    if (type === "leave" || to === null) return;
    leave(() => {
      if (type === "popstate") history.go(delta ?? 0);
      else if (willUnload) location.assign(to.url);
      else void goto(to.url);
    });
  });

  // The one key listener in the shell. Every chord is resolved against whatever is
  // on screen, and a command that only goes somewhere is gone to — which is
  // how a key reaches a control the mouse reaches as a link.
  function onkeydown(event: KeyboardEvent): void {
    if (shut) return;

    const found = dispatch(event, published(), chordFor);
    if (found === undefined) return;
    if ("run" in found) void found.run();
    else void goto(found.href);
  }
</script>

<svelte:window {onkeydown} />

<svelte:head>
  <title>Notemap</title>
</svelte:head>

<div
  class="min-h-dvh {menued
    ? width.full
      ? 'grid grid-cols-[var(--spacing-menu)_minmax(0,1fr)]'
      : 'grid grid-cols-[var(--spacing-menu-rail)_minmax(0,1fr)]'
    : ''}"
>
  {#if menued}
    <aside
      class="sticky top-0 flex h-dvh flex-col border-r border-rule bg-paper"
    >
      <div class="flex min-h-bar items-center border-b border-rule px-gutter">
        {#if width.full}
          <a
            href={resolve("/")}
            class="font-display text-title text-ink no-underline hover:no-underline"
            >notemap</a
          >
        {/if}
      </div>
      <Menu current={page.url.pathname} queue={$queue} rail={!width.full} />
      {#if width.full}
        <Glance />
      {/if}
      {#if width.full && waiting > 0}
        <p class="px-gutter py-2 text-small">{waiting} waiting to send</p>
      {/if}
      <div class="mt-auto">
        <Reach
          reachable={pool.known ? pool.yes : undefined}
          at={pool.at}
          who={who.who}
          compact={!width.full}
        />
      </div>
    </aside>
  {/if}

  <!-- Where the page's pane starts, for a bar docked at its foot. -->
  <div
    class="{fills ? 'h-dvh' : 'min-h-dvh'} flex min-w-0 flex-col"
    style:--menu-left={menued
      ? width.full
        ? "var(--spacing-menu)"
        : "var(--spacing-menu-rail)"
      : "0px"}
    style:--pane-left="var(--menu-left)"
  >
    {#if page.route.id === "/items/[id]" && !shut && page.params["id"] !== undefined}
      <ItemHead id={page.params["id"]} />
    {:else}
      <Header {title} list={list && !shut} onmenu={() => (drawer = true)} />
    {/if}
    <Strip />
    <div class="flex-1 {fills ? 'flex min-h-0 flex-col' : ''}">
      <Sheet
        {fills}
        bleeds={bleeds && !shut}
        clears={shut || page.route.id?.startsWith("/settings") !== true}
      >
        <Column
          {fills}
          list={list ||
            takesWindow ||
            page.route.id === "/items/[id]" ||
            page.route.id?.startsWith("/settings") === true ||
            page.route.id === "/items/[id]/records/[recordId]"}
        >
          {#if signIn}
            <SignIn />
          {:else}
            {@render children()}
          {/if}
        </Column>
      </Sheet>
    </div>
    <StatusLine {shut} drawn={list || shut} />
  </div>
</div>

{#if drawer && !width.wide && !shut}
  <Drawer
    current={page.url.pathname}
    queue={$queue}
    {waiting}
    reachable={pool.known ? pool.yes : undefined}
    at={pool.at}
    who={who.who}
    onclose={() => (drawer = false)}
  />
{/if}

{#if quick.item !== undefined && !shut}
  <Quick item={quick.item} onclose={() => quick.close()} />
{/if}

<Dropping />
<Sprite />
<Going />
