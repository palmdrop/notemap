<script lang="ts">
  export type Surface = { readonly href: string; readonly label: string };

  let { surfaces, current }: { surfaces: readonly Surface[]; current: string } =
    $props();
</script>

<nav class="flex gap-4 max-narrow:gap-3" aria-label="Surfaces">
  {#each surfaces as surface (surface.href)}
    <a
      href={surface.href}
      aria-current={surface.href === current ? "page" : undefined}
      class:inverted={surface.href === current}
    >
      {surface.label}
    </a>
  {/each}
</nav>
