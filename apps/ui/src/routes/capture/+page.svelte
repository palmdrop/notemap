<script lang="ts">
  import { onMount } from "svelte";
  import { goto, replaceState } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Capture from "$components/capture/Capture.svelte";
  import { client } from "$lib/client";
  import { headed } from "$lib/heading.svelte";
  import { sayLanded } from "$lib/landed";
  import { notices } from "$lib/notices.svelte";
  import { shareIntoDraft } from "$lib/sharing/into-draft";

  const queue = client.queue;

  // Whatever was shared from another app is taken whenever this page is drawn,
  // not only when it is arrived at from a share: a share that came while the
  // door was shut waits for the page behind it.
  onMount(() => {
    void shareIntoDraft()
      .then((taken) => {
        if (taken === "unwritable") {
          notices.raise({
            what: "could not keep what was shared",
            alarm: true,
          });
        }
      })
      .catch(() => {
        notices.raise({ what: "could not read what was shared", alarm: true });
      })
      .finally(() => {
        if (!page.url.searchParams.has("shared")) return;
        const plain = new URL(page.url);
        plain.searchParams.delete("shared");
        replaceState(plain, page.state);
      });
  });

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
