<script lang="ts" generics="T extends string">
  import Icon from "$components/primitives/icon/Icon.svelte";

  /**
   * A long choice, as rows: a heading to append under, a folder mode, a
   * template's answers when wide. Each row may carry a line saying what it
   * does.
   */
  let {
    label,
    value,
    options,
    disabled = false,
    onchoose,
  }: {
    label: string;
    value: T | undefined;
    options: readonly { value: T; word: string; line?: string }[];
    disabled?: boolean;
    onchoose: (value: T) => void;
  } = $props();
</script>

<ul role="radiogroup" aria-label={label} class="m-0 list-none p-0">
  {#each options as one (one.value)}
    {@const on = one.value === value}
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        {disabled}
        onclick={() => onchoose(one.value)}
        class="flex w-full items-center justify-between gap-3 border-b border-rule px-gutter text-left disabled:text-muted {one.line ===
        undefined
          ? 'min-h-target'
          : 'min-h-bar py-2'}"
      >
        <span class="flex-1">
          {one.word}
          {#if one.line !== undefined}
            <small class="block text-small text-muted">{one.line}</small>
          {/if}
        </span>
        <Icon
          name={on ? "circle-check" : "circle"}
          class="size-5 {on ? 'text-ink' : 'text-rule'}"
        />
      </button>
    </li>
  {/each}
</ul>
