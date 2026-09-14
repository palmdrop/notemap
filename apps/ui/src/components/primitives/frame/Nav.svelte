<script lang="ts">
  export type Surface = { readonly href: string; readonly label: string };

  let { surfaces, current }: { surfaces: readonly Surface[]; current: string } =
    $props();
</script>

<nav class="flex gap-5 max-narrow:gap-3.5" aria-label="Surfaces">
  {#each surfaces as surface (surface.href)}
    <a
      href={surface.href}
      aria-current={surface.href === current ? "page" : undefined}
      class:font-semibold={surface.href === current}
    >
      {surface.label}
    </a>
  {/each}
</nav>
