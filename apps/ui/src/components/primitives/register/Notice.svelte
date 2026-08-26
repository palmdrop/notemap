<script lang="ts">
  import Body from "./Body.svelte";
  import Rail from "./Rail.svelte";

  /** A row about the surface rather than about an item: the rail names which. */
  let {
    surface,
    said,
    alarm = false,
    first = false,
  }: {
    surface: string;
    said: string;
    alarm?: boolean;
    first?: boolean;
  } = $props();
</script>

<Rail {first}>{surface}</Rail>
<Body {first}>
  <span role="status" class={alarm ? "font-mono text-accent" : "text-ink-muted"}
    >{said}</span
  >
</Body>
