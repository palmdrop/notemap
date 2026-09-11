<script lang="ts">
  import Walked from "./Walked.svelte";

  let {
    on = false,
    held = false,
    dim = false,
    ontake,
  }: {
    on?: boolean;
    held?: boolean;
    dim?: boolean;
    ontake: () => void;
  } = $props();
</script>

<Walked {on} {held} {dim} {ontake}>a row</Walked>
