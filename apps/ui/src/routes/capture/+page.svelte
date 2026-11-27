<script lang="ts">
  import { onMount } from "svelte";
  import { goto, replaceState } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Capture from "$components/capture/Capture.svelte";
  import { client } from "$lib/client";
  import { headed } from "$lib/heading.svelte";
  import { session } from "$lib/session.svelte";
  import { sayLanded } from "$lib/landed";
  import { shareIntoDraft } from "$lib/sharing/into-draft";

  const queue = client.queue;

  // Whatever was shared from another app is taken whenever this page is drawn,
  // not only when it is arrived at from a share: a share that came while the
  // door was shut waits for the page behind it.
  /** What became of a share, said over the bar: the status line is not drawn here. */
  let told = $state<{ words: string; alarm?: boolean } | undefined>(undefined);

  const who = session();
  const HELD = {
    words: "Signed out. What you capture is held until someone signs in.",
  };

  onMount(() => {
    const arrived = page.url.searchParams.get("shared");
    if (arrived === "failed") {
      told = { words: "Could not take what was shared.", alarm: true };
    }
    void shareIntoDraft()
      .then((taken) => {
        if (taken === "unwritable") {
          told = { words: "Could not keep what was shared.", alarm: true };
        } else if (taken === "restored" && arrived !== null) {
          // Said, since a share can come from a page as well as from the
          // system sheet, and what it added sits at the end of the draft.
          told = { words: "Added what was shared, at the end." };
        }
      })
      .catch(() => {
        told = { words: "Could not read what was shared.", alarm: true };
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
  told={told ?? (who.shut ? HELD : undefined)}
  oncaptured={(item) => {
    sayLanded(item, $queue.order);
    void goto(resolve("/"));
  }}
/>
