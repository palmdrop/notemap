<script lang="ts">
  import Body from "./Body.svelte";
  import Rail from "./Rail.svelte";
  import Register from "./Register.svelte";

  let { furled = false, onpick }: { furled?: boolean; onpick?: () => void } =
    $props();
</script>

<Register {furled}>
  <Rail {onpick}>
    <span>the rail</span>
    <button type="button">a tag</button>
  </Rail>
  <Body {onpick}>
    <span>the body</span>
  </Body>
</Register>
