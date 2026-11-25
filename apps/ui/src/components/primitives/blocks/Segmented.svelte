<script lang="ts" generics="T extends string">
  import { untrack } from "svelte";

  /** One choice of a few: a beige row, the chosen part filled, the fill sliding to a new choice. */
  let {
    label,
    value,
    options,
    disabled = false,
    held = false,
    onchoose,
  }: {
    label: string;
    value: T | undefined;
    options: readonly { value: T; word: string }[];
    disabled?: boolean;
    /** Takes no press, drawn as it is: a hold too short to be worth a flash of grey. */
    held?: boolean;
    onchoose: (value: T) => void;
  } = $props();

  let group = $state<HTMLElement | undefined>(undefined);
  let parts = $state<Record<string, HTMLElement | undefined>>({});
  /** Where the fill stands, under the chosen part; it slides from one to the next. */
  let fill = $state<{ left: number; width: number } | undefined>(undefined);
  /** The first place it is drawn at is arrived at, not slid to. */
  let placed = $state(false);

  function place(): void {
    const chosen = value === undefined ? undefined : parts[value];
    fill =
      chosen === undefined
        ? undefined
        : { left: chosen.offsetLeft, width: chosen.offsetWidth };
  }

  $effect(() => {
    void value;
    void options;
    untrack(place);
  });

  $effect(() => {
    if (fill === undefined || placed) return;
    const frame = requestAnimationFrame(() => (placed = true));
    return () => cancelAnimationFrame(frame);
  });

  /** The arrows move the choice along the row, as a radio group's do. */
  function keys(event: KeyboardEvent): void {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 || disabled || held) return;
    event.preventDefault();
    const at = options.findIndex((one) => one.value === value);
    const next =
      options[(Math.max(at, 0) + step + options.length) % options.length];
    if (next === undefined) return;
    onchoose(next.value);
    parts[next.value]?.focus();
  }

  $effect(() => {
    if (group === undefined || typeof ResizeObserver === "undefined") return;
    const watching = new ResizeObserver(place);
    watching.observe(group);
    return () => watching.disconnect();
  });
</script>

<div class="max-w-full [scrollbar-width:none] overflow-x-auto">
  <div
    role="radiogroup"
    aria-label={label}
    tabindex="-1"
    onkeydown={keys}
    bind:this={group}
    class="relative inline-flex flex-nowrap gap-[0.1875rem] rounded-control border border-off-line bg-off p-[0.1875rem]"
  >
    {#if fill !== undefined}
      <span
        aria-hidden="true"
        class="absolute inset-y-[0.1875rem] rounded-[calc(var(--radius-control)-0.1875rem)] {disabled
          ? 'bg-rule'
          : 'bg-ink'} {placed
          ? 'transition-[left,width,background-color] duration-(--duration-short) ease-motion'
          : ''}"
        style:left="{fill.left}px"
        style:width="{fill.width}px"
      ></span>
    {/if}
    {#each options as one (one.value)}
      {@const on = one.value === value}
      <button
        type="button"
        role="radio"
        aria-checked={on}
        tabindex={on || (value === undefined && one === options[0]) ? 0 : -1}
        {disabled}
        aria-disabled={held || undefined}
        onclick={() => {
          if (!on && !held) onchoose(one.value);
        }}
        bind:this={parts[one.value]}
        class="relative min-h-11 rounded-[calc(var(--radius-control)-0.1875rem)] px-3.5 whitespace-nowrap wide:min-h-9 {on
          ? 'text-paper disabled:text-ink'
          : 'text-ink active:bg-off-down disabled:text-muted'}"
      >
        {one.word}
      </button>
    {/each}
  </div>
</div>
