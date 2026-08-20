<script lang="ts">
  import { page } from "$app/state";

  import Refusals from "$components/outbox/Refusals.svelte";
  import ThemeToggle from "$components/theme/ThemeToggle.svelte";
  import Bar from "$components/primitives/frame/Bar.svelte";
  import Column from "$components/primitives/frame/Column.svelte";
  import Nav from "$components/primitives/frame/Nav.svelte";
  import Reachability from "$components/primitives/frame/Reachability.svelte";
  import Sheet from "$components/primitives/frame/Sheet.svelte";
  import { composing } from "$lib/composing.svelte";
  import { reachable } from "$lib/reachable.svelte";

  import "./layout.css";

  let { children } = $props();

  const pool = reachable();

  const SURFACES = [
    { href: "/", label: "queue" },
    { href: "/feed", label: "feed" },
  ];
</script>

<Sheet>
  <Column wide={composing.open}>
    <Bar>
      <Nav surfaces={SURFACES} current={page.url.pathname} />
      <span class="ml-auto flex gap-4 max-narrow:gap-3">
        <Reachability yes={pool.yes} />
        <a href="/settings">settings</a>
      </span>
    </Bar>

    {@render children()}
  </Column>
</Sheet>

<Refusals />
<ThemeToggle />
