<script lang="ts">
  import Alarm from "$components/primitives/alarm/Alarm.svelte";
  import Refusal from "$components/primitives/alarm/Refusal.svelte";
  import { client } from "$lib/client";

  const outbox = client.outbox;

  /**
   * Only what a person has to act on. Work waiting for the daemon heals itself
   * and the chrome already says the pool is out of reach.
   */
  const refused = $derived($outbox.filter((held) => held.state === "refused"));
</script>

{#if refused.length > 0}
  <Alarm>
    {#each refused as held (held.id)}
      <Refusal
        what={`refused — ${held.operation.kind}`}
        why={held.failure ?? "no reason given"}
        ondismiss={() => void client.dismiss(held.id)}
      />
    {/each}
  </Alarm>
{/if}
