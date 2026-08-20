<script lang="ts">
  import type { RoutingSummary } from "@notemap/client";

  import Label from "$components/primitives/register/Label.svelte";
  import Value from "$components/primitives/register/Value.svelte";
  import { client } from "$lib/client";
  import { whereItWent } from "$lib/routing";

  let { summary }: { summary: RoutingSummary | undefined } = $props();

  const destinations = client.destinations.all;

  /** A destination read has not arrived, or the pool is out of reach: say the id. */
  const nameOf = $derived(
    (id: string) => $destinations.find((one) => one.id === id)?.name ?? id,
  );
</script>

<Label name="routing" />
<Value empty={summary === undefined}>
  {summary === undefined ? "none yet" : whereItWent(summary, nameOf)}
</Value>
