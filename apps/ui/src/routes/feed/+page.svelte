<script lang="ts">
  import FeedList from "$components/feed/Feed.svelte";
  import { createFeed } from "$lib/feed/feed.svelte";

  const feed = createFeed();
</script>

<FeedList {feed} />
