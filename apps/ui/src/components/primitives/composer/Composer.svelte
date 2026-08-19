<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    onclose,
    onreserve,
    children,
  }: {
    title: string;
    onclose: () => void;
    /**
     * How tall the row it sits in must be. The panel is out of that row's flow,
     * so nothing else would make the register keep room for it.
     */
    onreserve?: (height: number) => void;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLElement>();

  $effect(() => {
    const element = panel;
    if (element === undefined || onreserve === undefined) return;

    const measure = () => onreserve(element.offsetTop + element.offsetHeight);

    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(element);
    return () => {
      watching.disconnect();
      onreserve(0);
    };
  });
</script>

<!--
  Beside the row, first line level with the note's. Below the breakpoint it
  becomes a block inside the row, so nothing ever hides the register.
-->
<aside
  bind:this={panel}
  class="absolute top-6 left-[calc(100%+var(--spacing-spine)+1px+var(--spacing-gap))] w-[calc(var(--spacing-panel)-var(--spacing-gap))] font-mono text-mono max-aside:static max-aside:col-span-full max-aside:mt-5 max-aside:w-auto"
>
  <div class="flex items-baseline justify-between gap-4">
    <span>{title}</span>
    <button
      type="button"
      aria-label="Close"
      onclick={onclose}
      class="hover:text-accent"
    >
      ×
    </button>
  </div>
  {@render children()}
</aside>
