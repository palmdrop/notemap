<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import { NO_MORE_OFFLINE } from "$lib/said";

  let {
    loading,
    offline,
    onmore,
  }: { loading: boolean; offline: boolean; onmore: () => void } = $props();
</script>

<Foot>
  {#if offline}
    <span class="text-ink-muted">{NO_MORE_OFFLINE}</span>
  {:else}
    <Action disabled={loading} onclick={onmore}>
      {loading ? "loading…" : "load more"}
    </Action>
  {/if}
</Foot>
