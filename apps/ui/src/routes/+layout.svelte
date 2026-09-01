<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";

  import Order from "$components/order/Order.svelte";
  import Refusals from "$components/outbox/Refusals.svelte";
  import SignIn from "$components/session/SignIn.svelte";
  import ThemeToggle from "$components/theme/ThemeToggle.svelte";
  import Bar from "$components/primitives/frame/Bar.svelte";
  import Column from "$components/primitives/frame/Column.svelte";
  import Nav from "$components/primitives/frame/Nav.svelte";
  import Reachability from "$components/primitives/frame/Reachability.svelte";
  import Sheet from "$components/primitives/frame/Sheet.svelte";
  import Waiting from "$components/primitives/frame/Waiting.svelte";
  import { client } from "$lib/client";
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
    { href: "/", label: "queue" },
    { href: "/feed", label: "feed" },
  ];

  // Swallowed because an unreachable pool is what the reachability mark is for:
  // a row then says "a destination" and completion offers less. A shut door is
  // swallowed too: what it refuses is drawn by the login, not by a row.
  onMount(() => {
    void client.destinations.load().catch(() => undefined);
    void client.tags.load().catch(() => undefined);
  });

  // The cache holds the pool's items and the door is shut; drawing them because
  // they happen to be local would make signing out mean nothing. What is still
  // said is how much unsent work is held, because that is the person's and its
  // loss would otherwise be silent.
  const shut = $derived(who.shut);
</script>

<Sheet>
  <Column>
    <Bar>
      {#if shut}
        <span class="font-mono tracking-[0.3em] text-ink-muted uppercase">
          notemap
        </span>
      {:else}
        <Nav surfaces={SURFACES} current={page.url.pathname} />
      {/if}
      <span
        class="ml-auto flex flex-wrap items-baseline gap-4 max-narrow:gap-3"
      >
        {#if !shut}
          <Order />
        {/if}
        <Waiting count={held.count} />
        <Reachability yes={pool.yes} />
        {#if !shut}
          <a href="/settings">settings</a>
        {/if}
      </span>
    </Bar>

    {#if shut}
      <SignIn />
    {:else if who.known}
      {@render children()}
    {/if}
  </Column>
</Sheet>

{#if !shut}
  <Refusals />
{/if}
<ThemeToggle />
