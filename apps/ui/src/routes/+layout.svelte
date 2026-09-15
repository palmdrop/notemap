<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Corner from "$components/notices/Corner.svelte";
  import SignIn from "$components/session/SignIn.svelte";
  import Bar from "$components/primitives/frame/Bar.svelte";
  import Column from "$components/primitives/frame/Column.svelte";
  import Nav from "$components/primitives/frame/Nav.svelte";
  import Sheet from "$components/primitives/frame/Sheet.svelte";
  import Status from "$components/primitives/frame/Status.svelte";
  import { client } from "$lib/client";
  import { chordFor } from "$lib/command/bindings";
  import { dispatch } from "$lib/command/dispatch";
  import { published } from "$lib/command/stack.svelte";
  import { notices } from "$lib/notices.svelte";
  import { reachable, watched } from "$lib/reachable.svelte";
  import { session } from "$lib/session.svelte";
  import { waiting } from "$lib/waiting.svelte";

  import "./layout.css";

  let { children } = $props();

  const pool = reachable();
  const held = waiting();
  const who = session();

  watched();

  const SURFACES = [
    { href: resolve("/"), label: "queue" },
    { href: resolve("/feed"), label: "feed" },
    { href: resolve("/log"), label: "log" },
    { href: resolve("/settings"), label: "settings" },
  ];

  // Swallowed because an unreachable pool is what the status glyph is for: a
  // row then says "a destination" and completion offers less. A shut door is
  // swallowed too: what it refuses is drawn by the login, not by a row.
  onMount(() => {
    void client.destinations.load().catch(() => undefined);
    void client.templates.load().catch(() => undefined);
    void client.tags.load().catch(() => undefined);
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
    untrack(() => notices.clear());
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
      <Status reachable={pool.yes} waiting={held.count} />
    </Bar>

    {#if shut}
      <SignIn />
    {:else if who.known}
      {@render children()}
    {/if}
  </Column>
</Sheet>

{#if !shut}
  <Corner />
{/if}
