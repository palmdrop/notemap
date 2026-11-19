<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";

  import { isCurrent, SURFACES } from "./surfaces";

  /**
   * Where to go: the queue, the feed, the log and settings, each an icon and a
   * word, the queue with how much it holds. In the drawer and as the wide
   * window's column; as a rail of icons from 900 to 1199px, where the word is
   * the icon's label.
   */
  let {
    current,
    queue,
    rail = false,
    ongo,
  }: {
    current: string;
    queue?: number | undefined;
    rail?: boolean;
    /** Somewhere was chosen: the drawer closes. */
    ongo?: () => void;
  } = $props();
</script>

<nav aria-label="Surfaces">
  <ul class="m-0 list-none p-0">
    {#each SURFACES as surface (surface.href)}
      {@const on = isCurrent(surface.href, current)}
      {@const count = surface.label === "queue" ? queue : undefined}
      <li>
        <a
          href={surface.href}
          aria-current={on ? "page" : undefined}
          aria-label={rail
            ? `${surface.label}${count === undefined ? "" : `, ${String(count)}`}`
            : undefined}
          title={rail ? surface.label : undefined}
          onclick={() => ongo?.()}
          class="relative flex items-center border-b border-rule no-underline hover:no-underline {on
            ? 'bg-picked'
            : 'hover:bg-hover active:bg-off-down'} {rail
            ? 'min-h-11 justify-center'
            : 'min-h-11 gap-gutter px-gutter'}"
        >
          <Icon name={surface.icon} class={rail ? "size-6" : "size-icon"} />
          {#if rail}
            {#if count !== undefined}
              <span
                aria-hidden="true"
                class="absolute top-1.5 right-1.5 text-badge tabular-nums"
                >{count}</span
              >
            {/if}
          {:else}
            <span class="flex-1">{surface.label}</span>
            {#if count !== undefined}
              <span class="tabular-nums">{count}</span>
            {/if}
          {/if}
        </a>
      </li>
    {/each}
  </ul>
</nav>
