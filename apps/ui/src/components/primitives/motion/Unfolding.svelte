<script lang="ts">
  import type { Snippet } from "svelte";

  import { following, slide } from "$lib/motion";

  /**
   * Slides open and shut, and while open grows and shrinks into whatever it
   * comes to hold — a form whose fields change with a choice made in it.
   */
  let { children }: { children: Snippet } = $props();
</script>

<div transition:slide={{ magnitude: "short" }}>
  <div {@attach following}>
    <!-- Its own formatting context, so a margin inside is part of the height
         the box follows rather than collapsing out past it. -->
    <div class="flow-root">{@render children()}</div>
  </div>
</div>
