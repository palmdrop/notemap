<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";

  import Order from "$components/order/Order.svelte";
  import Refusals from "$components/outbox/Refusals.svelte";
  import ThemeToggle from "$components/theme/ThemeToggle.svelte";
  import Bar from "$components/primitives/frame/Bar.svelte";
  import Column from "$components/primitives/frame/Column.svelte";
  import Nav from "$components/primitives/frame/Nav.svelte";
  import Reachability from "$components/primitives/frame/Reachability.svelte";
  import Sheet from "$components/primitives/frame/Sheet.svelte";
  import Waiting from "$components/primitives/frame/Waiting.svelte";
  import { client } from "$lib/client";
  import { reachable, watched } from "$lib/reachable.svelte";
  import { waiting } from "$lib/waiting.svelte";

  import "./layout.css";

  let { children } = $props();

  const pool = reachable();
  const held = waiting();

  watched();

  const SURFACES = [
    { href: "/", label: "queue" },
    { href: "/feed", label: "feed" },
  ];

  // Swallowed because an unreachable pool is what the reachability mark is for:
  // a row then says "a destination" and completion offers less.
  onMount(() => {
    void client.destinations.load().catch(() => undefined);
    void client.tags.load().catch(() => undefined);
  });
</script>

<Sheet>
  <Column>
    <Bar>
      <Nav surfaces={SURFACES} current={page.url.pathname} />
      <span
        class="ml-auto flex flex-wrap items-baseline gap-4 max-narrow:gap-3"
      >
        <Order />
        <Waiting count={held.count} />
        <Reachability yes={pool.yes} />
        <a href="/settings">settings</a>
      </span>
    </Bar>

    {@render children()}
  </Column>
</Sheet>

<Refusals />
<ThemeToggle />
