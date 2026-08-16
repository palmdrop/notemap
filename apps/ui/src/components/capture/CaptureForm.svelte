<script lang="ts">
  import { capture, saidBy, upload, type Item } from "$lib/api";

  let { oncaptured }: { oncaptured: (item: Item) => void } = $props();

  let text = $state("");
  let chosen = $state<File | undefined>(undefined);
  let busy = $state(false);
  let said = $state("");
  let bad = $state(false);
  let picker: HTMLInputElement;

  function tell(message: string, wrong = false) {
    said = message;
    bad = wrong;
  }

  function pick(event: Event) {
    chosen = (event.currentTarget as HTMLInputElement).files?.[0];
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (chosen === undefined && text.trim() === "") return;

    busy = true;
    try {
      let asset: string | undefined;
      if (chosen !== undefined) {
        tell("uploading…");
        asset = (await upload(chosen)).id;
      }

      tell("capturing…");
      const outcome = await capture({
        text,
        ...(asset === undefined ? {} : { asset }),
      });

      if (outcome.kind === "already-captured") {
        tell(`already captured (matched on ${outcome.matchedOn})`);
        return;
      }

      text = "";
      chosen = undefined;
      picker.value = "";
      tell("captured");
      oncaptured(outcome.item);
    } catch (error) {
      // An upload that failed reports its own refusal verbatim; anything
      // without one is the daemon being unreachable.
      tell(saidBy(error) || "the daemon is not reachable", true);
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={submit} class="grid gap-2">
  <textarea
    bind:value={text}
    placeholder="Anything worth keeping…"
    aria-label="What to capture"
    class="min-h-24 w-full resize-y rounded-lg border border-neutral-300 p-3 dark:border-neutral-700"
  ></textarea>

  <div class="flex items-center gap-3">
    <input
      bind:this={picker}
      type="file"
      accept="image/*"
      disabled={busy}
      onchange={pick}
      aria-label="A picture to capture"
      class="max-w-full text-sm"
    />
    {#if chosen !== undefined}
      <span class="text-sm break-words text-neutral-500 dark:text-neutral-400">
        {chosen.name}
      </span>
    {/if}
  </div>

  <div class="flex items-center gap-3">
    <button
      type="submit"
      disabled={busy}
      class="rounded-lg border border-neutral-300 px-4 py-1.5 disabled:opacity-50 dark:border-neutral-700"
    >
      Capture
    </button>
    <span
      role="status"
      class="text-sm {bad
        ? 'text-red-700 dark:text-red-300'
        : 'text-neutral-500 dark:text-neutral-400'}"
    >
      {said}
    </span>
  </div>
</form>
