<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";

  import { settingsHref } from "$components/settings/href";
  import { narrow } from "$lib/breakpoint";

  // From `narrow` up, `/settings` is not a page of its own: it lands on the
  // first section. Below it, the layout draws the menu here instead — the
  // phone's landing page — and nothing is redirected.
  onMount(() => {
    if (!narrow())
      void goto(settingsHref("destinations"), { replaceState: true });
  });
</script>
