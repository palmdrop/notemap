<script lang="ts">
  import CaptureForm from "$components/capture/CaptureForm.svelte";
  import FeedList from "$components/feed/Feed.svelte";
  import { createFeed } from "$lib/feed/feed.svelte";

  const feed = createFeed();
</script>

<CaptureForm oncaptured={(item) => feed.prepend(item)} />
<FeedList {feed} />
