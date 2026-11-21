<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Dot from "$components/primitives/marks/Dot.svelte";
  import { timeOf } from "$lib/stamp";

  /**
   * The line's right: what is true, counted in words, in a fixed order. How
   * much is waiting to send, then Offline, said in ink: it is not a failure.
   */
  let {
    pending,
    reachable,
    at,
    ontoggle,
  }: {
    pending: number;
    reachable: boolean;
    /** When the pool last answered, said beside Offline. */
    at?: string | undefined;
    ontoggle: () => void;
  } = $props();
</script>

{#if pending > 0}
  <button
    type="button"
    class="flex flex-none items-center gap-2 whitespace-nowrap text-muted tabular-nums"
    aria-label={`${String(pending)} waiting`}
    onclick={ontoggle}
  >
    <Dot said="waiting to send" />
    {pending} waiting
  </button>
{/if}

<!-- Nothing while the pool answers, which is the ordinary state and says nothing. -->
{#if !reachable}
  <span
    role="status"
    class="flex flex-none items-center gap-1.5 whitespace-nowrap"
  >
    <Icon name="cloud-off" class="size-5" />
    Offline{#if at !== undefined}<span class="text-muted"
        >, last answered {timeOf(at)}</span
      >{/if}
  </span>
{/if}
