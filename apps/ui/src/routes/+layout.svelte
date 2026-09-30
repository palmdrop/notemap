<script lang="ts">
  import { untrack } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import SignIn from "$components/session/SignIn.svelte";
  import Bar from "$components/primitives/frame/Bar.svelte";
  import Column from "$components/primitives/frame/Column.svelte";
  import Nav from "$components/primitives/frame/Nav.svelte";
  import Sheet from "$components/primitives/frame/Sheet.svelte";
  import StatusLine from "$components/status/StatusLine.svelte";
  import { client } from "$lib/client";
  import { chordFor } from "$lib/command/bindings";
  import { dispatch } from "$lib/command/dispatch";
  import { firings } from "$lib/firings.svelte";
  import { published } from "$lib/command/stack.svelte";
  import { leave, unsaved } from "$lib/leaving.svelte";
  import { notices } from "$lib/notices.svelte";
  import { reachable, watched } from "$lib/reachable.svelte";
  import { session } from "$lib/session.svelte";

  import "./layout.css";

  let { children } = $props();

  const pool = reachable();
  const who = session();

  watched();

  const SURFACES = [
    { href: resolve("/"), label: "queue" },
    { href: resolve("/feed"), label: "feed" },
    { href: resolve("/log"), label: "log" },
    { href: resolve("/settings"), label: "settings" },
  ];

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

  /** The one surface that is a frame rather than a page. */
  const fills = $derived(page.route.id === "/items/[id]/process");

  // Signing out is the pool's work leaving with it. A standing failure about a
  // delivery nobody can now look up would outlive the session that raised it.
  $effect(() => {
    if (!shut) return;
    untrack(() => {
      notices.clear();
      firings.clear();
    });
  });

  // An edit with changes is asked about before the page goes: in the shell's
  // own words within the app, and in the browser's when the tab is left.
  // Asked, the navigation goes on the way it would have: back and forward move
  // through history, and a link out of the app is left to the browser.
  beforeNavigate((navigation) => {
    if (!unsaved()) return;
    navigation.cancel();
    const { type, to, delta, willUnload } = navigation;
    if (type === "leave" || to === null) return;
    leave(() => {
      if (type === "popstate") history.go(delta ?? 0);
      else if (willUnload) location.assign(to.url);
      else void goto(to.url);
    });
  });

  // The one listener in the shell. Every chord is resolved against whatever is
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

<Sheet {fills}>
  <Column {fills}>
    <Bar>
      {#if shut}
        <span>notemap</span>
      {:else}
        <Nav surfaces={SURFACES} current={page.url.pathname} />
      {/if}
    </Bar>

    {#if shut}
      <SignIn />
    {:else if who.known}
      {@render children()}
    {/if}
  </Column>
</Sheet>

<StatusLine {shut} />
