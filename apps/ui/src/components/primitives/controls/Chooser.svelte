<script lang="ts" generics="T extends string">
  import Option from "$components/primitives/composer/Option.svelte";

  /**
   * A word, a mark, and a panel of marked options — the idiom `where` already
   * uses. The browser's own `select` draws in the system's face and colours and
   * cannot be brought into this one, so the shell draws its own.
   *
   * Held while something it would change is still walking: a control showing an
   * answer the surface is not in would lie.
   */
  let {
    label,
    value,
    options,
    disabled = false,
    onchoose,
  }: {
    label: string;
    value: T;
    options: readonly { value: T; word: string }[];
    disabled?: boolean;
    onchoose: (value: T) => void;
  } = $props();

  let open = $state(false);

  /** Named so the word can say what it opens, there being more than one drawn. */
  const panel = $derived(`chooser-${label.toLowerCase().replace(/\W+/g, "-")}`);

  const word = $derived(
    options.find((one) => one.value === value)?.word ?? String(value),
  );

  function take(taken: T): void {
    open = false;
    onchoose(taken);
  }
</script>

<!-- Leaving the control is what shuts it, whichever way a person leaves. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative"
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      open = false;
    }
  }}
  onkeydown={(event) => {
    if (event.key !== "Escape" || !open) return;
    // Shutting this is what the key did here, so nothing above it — a composer
    // stepping back, a modal closing — also acts on the one press.
    event.stopPropagation();
    open = false;
  }}
>
  <button
    type="button"
    {disabled}
    aria-label={label}
    aria-expanded={open}
    aria-controls={panel}
    onclick={() => (open = !open)}
    class="flex cursor-pointer items-baseline gap-1 font-mono disabled:cursor-default disabled:text-ink-muted"
  >
    <span>{word}</span>
    <span aria-hidden="true" class="text-ink-muted">▾</span>
  </button>

  {#if open}
    <!-- A group of marked buttons and not a `listbox`, which would promise
         options this draws none of. Taking one never moves the caret — the
         idiom the place line uses — so the panel is never shut out from under
         the click that was choosing from it. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      id={panel}
      role="group"
      aria-label={label}
      onmousedown={(event) => event.preventDefault()}
      class="absolute top-full right-0 z-30 mt-1 w-max min-w-36 border border-ink bg-paper px-2.5 py-1 font-mono"
    >
      {#each options as one (one.value)}
        <Option
          label={one.word}
          chosen={one.value === value}
          onchoose={() => take(one.value)}
        />
      {/each}
    </div>
  {/if}
</div>
