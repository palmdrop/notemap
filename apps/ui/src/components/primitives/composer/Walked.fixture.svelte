<script lang="ts">
  import Walked from "./Walked.svelte";

  let {
    on = false,
    held = false,
    ontake,
  }: {
    on?: boolean;
    held?: boolean;
    ontake: () => void;
  } = $props();
</script>

<Walked {on} {held} {ontake}>a row</Walked>
