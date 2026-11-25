<script lang="ts">
  import { navigating } from "$app/state";
</script>

<!-- A page asked for and not yet drawn. It waits as the asking mark does, so
     a move that is quick shows nothing. -->
{#if navigating.to !== null}
  <div
    role="progressbar"
    aria-label="Opening the page"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 animate-appearing overflow-hidden"
  >
    <div
      class="h-full w-1/3 animate-going bg-ink motion-reduce:w-full motion-reduce:animate-none"
    ></div>
  </div>
{/if}
