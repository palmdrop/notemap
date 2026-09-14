<script lang="ts">
  import Body from "./Body.svelte";
  import Rail from "./Rail.svelte";
  import Register from "./Register.svelte";

  let {
    selected = false,
    onpick,
  }: { selected?: boolean; onpick?: () => void } = $props();
</script>

<Register>
  <Rail {selected} {onpick}>
    <span>the rail</span>
    <button type="button">a tag</button>
  </Rail>
  <Body {selected} {onpick}>
    <span>the body</span>
  </Body>
</Register>
