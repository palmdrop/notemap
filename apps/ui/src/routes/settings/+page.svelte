<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";

  import { settingsHref } from "$components/settings/href";
  import { wide } from "$lib/breakpoint";

  // When wide, `/settings` is not a page of its own: it lands on the first
  // section. Below, the layout draws the menu here instead — the phone's
  // landing page — and nothing is redirected.
  onMount(() => {
    if (wide()) void goto(settingsHref("destinations"), { replaceState: true });
  });
</script>
