<script lang="ts" generics="T extends string">
  /** One choice of a few: a beige row, the chosen part filled. */
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
</script>

<div class="max-w-full [scrollbar-width:none] overflow-x-auto">
  <div
    role="group"
    aria-label={label}
    class="inline-flex flex-nowrap gap-[0.1875rem] rounded-control border border-off-line bg-off p-[0.1875rem]"
  >
    {#each options as one (one.value)}
      {@const on = one.value === value}
      <button
        type="button"
        aria-pressed={on}
        {disabled}
        aria-disabled={held || undefined}
        onclick={() => {
          if (!on && !held) onchoose(one.value);
        }}
        class="min-h-11 rounded-[calc(var(--radius-control)-0.1875rem)] px-3.5 whitespace-nowrap wide:min-h-9 {on
          ? 'bg-ink text-paper disabled:bg-rule disabled:text-ink'
          : 'text-ink active:bg-off-down disabled:text-muted'}"
      >
        {one.word}
      </button>
    {/each}
  </div>
</div>
