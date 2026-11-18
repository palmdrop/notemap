<script lang="ts">
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import { saidBy } from "@notemap/client";

  import { client } from "$lib/client";

  let name = $state("admin");
  let password = $state("");
  let sending = $state(false);
  let refused: string | undefined = $state(undefined);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (sending || password === "") return;

    sending = true;
    refused = undefined;

    try {
      await client.login(name, password);
      password = "";
    } catch (error) {
      refused = saidBy(error);
    } finally {
      sending = false;
    }
  }
</script>

<form onsubmit={submit} class="mx-auto flex max-w-read flex-col gap-4 pt-6">
  <label class="flex flex-col gap-1">
    <span class="text-small text-muted">Name</span>
    <input
      bind:value={name}
      autocomplete="username"
      name="username"
      aria-label="name"
      class="min-h-11 rounded-control border border-edge bg-paper px-3 outline-none"
    />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-small text-muted">Password</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={password}
      type="password"
      autocomplete="current-password"
      name="password"
      aria-label="password"
      autofocus
      class="min-h-11 rounded-control border border-edge bg-paper px-3 outline-none"
    />
  </label>

  {#if refused !== undefined}
    <p role="alert" class="text-danger">{refused}</p>
  {/if}

  <button
    type="submit"
    disabled={password === "" || sending}
    aria-busy={sending || undefined}
    class="inline-flex min-h-12 items-center justify-center gap-2 rounded-control border bg-ink px-4 text-paper {password ===
    ''
      ? 'border-dashed border-off-line bg-paper text-muted'
      : 'border-ink'}"
  >
    {#if sending}<Spinner />{/if}
    Sign in
  </button>
</form>
