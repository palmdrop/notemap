<script lang="ts">
  export type Surface = { readonly href: string; readonly label: string };

  let { surfaces, current }: { surfaces: readonly Surface[]; current: string } =
    $props();

  /** Current anywhere under it: `settings` is read at a section's own address. */
  function on(href: string): boolean {
    return current === href || (href !== "/" && current.startsWith(`${href}/`));
  }
</script>

<nav class="flex gap-5 max-narrow:gap-3.5" aria-label="Surfaces">
  {#each surfaces as surface (surface.href)}
    <a
      href={surface.href}
      aria-current={on(surface.href) ? "page" : undefined}
      data-word={surface.label}
      class="steady-weight transition-[font-weight] duration-(--duration-short) ease-fade"
      class:font-semibold={on(surface.href)}
    >
      {surface.label}
    </a>
  {/each}
</nav>
