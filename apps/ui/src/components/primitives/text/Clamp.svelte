<script lang="ts">
  import { tick, type Snippet } from "svelte";

  import { grow } from "$lib/motion";

  let { children }: { children: Snippet } = $props();

  let box = $state<HTMLDivElement>();
  let open = $state(false);
  let over = $state(0);

  function hiddenLines(element: HTMLElement): number {
    const line = Number.parseFloat(getComputedStyle(element).lineHeight);
    const cut = element.scrollHeight - element.clientHeight;
    if (!Number.isFinite(line) || line <= 0 || cut <= 1) return 0;
    return Math.round(cut / line);
  }

  // The measure changes with the window, and so does how much is cut off.
  $effect(() => {
    const element = box;
    if (element === undefined || open) {
      over = 0;
      return;
    }

    const look = () => (over = hiddenLines(element));
    look();
    const watching = new ResizeObserver(look);
    watching.observe(element);
    return () => watching.disconnect();
  });

  async function unclamp() {
    const element = box;
    const from = element?.offsetHeight ?? 0;
    open = true;
    await tick();
    if (element !== undefined) grow(element, from);
  }
</script>

<!-- Ten lines, then a cue saying how many more there are. -->
<div bind:this={box} class={open ? undefined : "line-clamp-10"}>
  {@render children()}
</div>

{#if over > 0}
  <button
    type="button"
    onclick={() => void unclamp()}
    class="mt-1.5 hover:underline"
  >
    + {over} lines
  </button>
{/if}
