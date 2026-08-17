<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<div class="mx-auto max-w-2xl px-4 pt-8 pb-16">
  <header class="mb-6 flex items-baseline justify-between gap-4">
    <h1 class="m-0 text-lg font-medium">
      <a href="/">notemap</a>
    </h1>
    <span class="text-xs text-neutral-500 dark:text-neutral-400">
      <a href="/queue" class="underline">queue</a>
      ·
      <a href="/feed" class="underline">feed</a>
      ·
      <!-- The daemon serves these, not this app: let the browser leave. -->
      <a href="/log" data-sveltekit-reload class="underline">log</a>
      ·
      <a href="/docs" data-sveltekit-reload class="underline">api</a>
    </span>
  </header>

  {@render children()}
</div>
