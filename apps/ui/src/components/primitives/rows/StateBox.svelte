<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon, { type IconName } from "$components/primitives/icon/Icon.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";

  /**
   * What a record or a destination is, said in a box: green for delivered or
   * available, grey with a spinner for under way, grey for anything else, red
   * edged for a failure.
   */
  let {
    tone = "plain",
    icon,
    turning = false,
    children,
  }: {
    tone?: "good" | "plain" | "danger";
    icon?: IconName;
    turning?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="px-gutter py-4">
  <p
    role="status"
    class="m-0 flex items-start gap-3 rounded-control border px-4 py-3 {tone ===
    'good'
      ? 'border-signal bg-signal'
      : tone === 'danger'
        ? 'border-danger bg-paper text-danger'
        : 'border-tag-line bg-tag'}"
  >
    {#if turning}
      <span class="mt-0.5 flex-none"><Spinner /></span>
    {:else if icon !== undefined}
      <Icon name={icon} class="mt-0.5 size-5 flex-none" />
    {/if}
    <span class="min-w-0">{@render children()}</span>
  </p>
</div>
