<script lang="ts">
  import { untrack } from "svelte";

  import { page } from "$app/state";

  import Log from "$components/log/Log.svelte";
  import { log } from "$lib/log.svelte";
  import { orderFor } from "$lib/order";

  // The URL is what the log is reading: an order or a subject named on it is
  // what a reload and a shared link both come back to. Untracked because the
  // call reads the log's own state to decide, and an effect that depended on
  // what it changes would read the log again for as long as it kept failing.
  $effect(() => {
    const url = page.url;
    untrack(() =>
      log.reading(
        orderFor("log", url),
        url.searchParams.get("item") ?? undefined,
      ),
    );
  });
</script>

<Log />
