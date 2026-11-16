<script lang="ts">
  import type { Snippet } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";

  import Band from "$components/primitives/blocks/Band.svelte";
  import { width } from "$lib/breakpoint";
  import { headed } from "$lib/heading.svelte";

  /**
   * A section's page. Its name is the page's title, with the way back to the
   * menu on a phone, where the menu is not drawn beside it. `sub` is a group
   * of rows inside a section, under a band.
   */
  let {
    name,
    sub = false,
    right,
    children,
  }: {
    name: string;
    sub?: boolean;
    right?: Snippet;
    children: Snippet;
  } = $props();

  headed(() =>
    sub
      ? undefined
      : {
          title: name,
          ...(width.wide
            ? {}
            : {
                out: {
                  icon: "back" as const,
                  label: "Settings",
                  run: () => void goto(resolve("/settings")),
                },
              }),
        },
  );
</script>

{#if sub}
  <Band level={3} end={right}>{name}</Band>
{/if}

{@render children()}
