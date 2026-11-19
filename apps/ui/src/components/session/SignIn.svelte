<script lang="ts">
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import { saidBy } from "@notemap/client";

  import { client } from "$lib/client";

  let name = $state("admin");
  let password = $state("");
  let sending = $state(false);
  let refused: string | undefined = $state(undefined);

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
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

  <!-- Enter in either field signs in, as the bar's Sign in does. -->
  <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true"
  ></button>
</form>

<!-- The main action in the docked bar, as every page's is: dashed until there
     is a password to send. -->
<PageBar label="Sign in">
  <BarAction
    icon="next"
    label="Sign in"
    primary
    working={sending}
    why={password === "" ? "Type the password to sign in." : undefined}
    onclick={() => void submit()}
  />
</PageBar>
