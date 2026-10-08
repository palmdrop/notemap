<script lang="ts">
  import { CLEAR_FILTERS } from "$lib/said";

  /** Ruled round, since it stands in a sentence and would otherwise read as more of it. */
  let { onclick }: { onclick?: () => void } = $props();
</script>

<button
  type="button"
  class="ml-[1ch] border border-ink px-[1ch] hover:underline"
  {onclick}
>
  {CLEAR_FILTERS}
</button>
