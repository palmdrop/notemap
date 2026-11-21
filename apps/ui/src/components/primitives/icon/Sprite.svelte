<script lang="ts">
  import sprite from "./notemap.svg?raw";

  /**
   * The icons, drawn once into the page rather than fetched by each `<use>`:
   * an icon first drawn while the pool is out of reach is there all the same,
   * and the build carries them wherever it is wrapped.
   */
  const symbols = sprite
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
</script>

<svg aria-hidden="true" class="hidden">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html symbols}
</svg>
