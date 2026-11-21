<script lang="ts">
  import { client } from "$lib/client";
  import { notices } from "$lib/notices.svelte";
  import { isCapture } from "$lib/refused";
  import Icon from "$components/primitives/icon/Icon.svelte";

  import { PANEL, panel } from "./panel.svelte";

  /**
   * The notices, from the header: a red count of what went wrong since they
   * were last opened, and of the captures the pool refused that are still held.
   */
  const outbox = client.outbox;

  const kept = $derived(
    $outbox.filter((held) => held.state === "refused" && isCapture(held))
      .length,
  );
  const wrong = $derived(notices.unseen + kept);
  const label = $derived(
    wrong > 0 ? `notices, ${String(wrong)} gone wrong` : "notices",
  );
</script>

<button
  type="button"
  aria-label={label}
  aria-expanded={panel.open}
  aria-controls={PANEL}
  title="Notices (n)"
  onclick={() => panel.toggle()}
  class="relative grid min-h-target min-w-target place-items-center"
>
  <Icon name="bell" />
  {#if wrong > 0}
    <span
      aria-hidden="true"
      class="absolute top-1 right-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-danger px-1 text-badge font-bold text-paper tabular-nums"
      >{wrong}</span
    >
  {/if}
</button>
