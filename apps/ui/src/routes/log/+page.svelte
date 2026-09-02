<script lang="ts">
  import { page } from "$app/state";

  import Log from "$components/log/Log.svelte";
  import { log } from "$lib/log.svelte";
  import { orderFor } from "$lib/order";

  // The URL is what the log is reading: an order or a subject named on it is
  // what a reload and a shared link both come back to.
  $effect(() => {
    log.reading(
      orderFor("log", page.url),
      page.url.searchParams.get("item") ?? undefined,
    );
  });
</script>

<Log />
