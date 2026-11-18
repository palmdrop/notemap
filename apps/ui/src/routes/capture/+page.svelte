<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";

  import Capture from "$components/capture/Capture.svelte";
  import { client } from "$lib/client";
  import { headed } from "$lib/heading.svelte";
  import { sayLanded } from "$lib/landed";

  const queue = client.queue;

  headed(() => ({
    title: "capture",
    out: {
      icon: "close",
      label: "Close",
      run: () => {
        if (history.length > 1) history.back();
        else void goto(resolve("/"));
      },
    },
  }));
</script>

<svelte:head>
  <title>Capture | Notemap</title>
</svelte:head>

<Capture
  form="page"
  oncaptured={(item) => {
    sayLanded(item, $queue.order);
    void goto(resolve("/"));
  }}
/>
