<script lang="ts">
  import { saidBy, type MintedToken, type Token } from "@notemap/client";

  import Band from "$components/primitives/blocks/Band.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import { copyable } from "$lib/clipboard";
  import { log } from "$lib/log.svelte";
  import { session } from "$lib/session.svelte";
  import { forgetOutputs } from "$lib/outputs";

  const who = session();

  let signingOut = $state(false);
  let signOutFailed: string | undefined = $state(undefined);

  async function signOut() {
    signingOut = true;
    signOutFailed = undefined;

    try {
      await client.logout();
    } catch (error) {
      // The cache is dropped either way; this only says the daemon was not told.
      signOutFailed = saidBy(error);
    } finally {
      signingOut = false;
      // Dropped either way, on the same terms as the client's own cache: the
      // log and what its deliveries sent are the pool's, and this shell is
      // the only thing holding them.
      log.forget();
      forgetOutputs();
    }
  }

  let held = $state<readonly Token[]>([]);
  let asked = $state(false);
  let addingToken = $state(false);
  let name = $state("");
  let going = $state(false);
  /** Which token a `revoke` was pressed on, while it is asked. */
  let revoking = $state<string | undefined>(undefined);
  let minting = $state(false);
  let said = $state("");

  /**
   * Held here and nowhere else: the daemon stored a hash, so this is the only
   * moment the string exists anywhere a person can read it.
   */
  let minted = $state<MintedToken | undefined>(undefined);
  let copied = $state(false);

  const day = (instant?: string) =>
    instant === undefined ? undefined : instant.slice(0, 10);

  const why = (token: Token) =>
    `made ${day(token.createdAt) ?? ""}, ${
      token.lastUsedAt === undefined
        ? "never used"
        : `last used ${day(token.lastUsedAt) ?? ""}`
    }`;

  async function attempt(what: () => Promise<unknown>) {
    said = "";
    going = true;

    try {
      await what();
    } catch (error) {
      said = saidBy(error);
    } finally {
      going = false;
    }
  }

  const read = () =>
    attempt(async () => {
      held = await client.tokens.list();
    });

  // Only a session may read these at all, so nothing is asked until there is
  // one — a token-carrying shell would be answered `session-required`.
  $effect(() => {
    if (who.canSignOut && !asked) {
      asked = true;
      void read();
    }
  });

  const mint = (event: SubmitEvent) => {
    event.preventDefault();
    if (going || name.trim() === "") return;

    minting = true;
    void attempt(async () => {
      minted = await client.tokens.mint({ name: name.trim() });
      copied = false;
      name = "";
      addingToken = false;
      held = await client.tokens.list();
    }).finally(() => (minting = false));
  };

  const revoke = (token: Token) => {
    revoking = token.id;
    return attempt(async () => {
      await client.tokens.revoke(token.id);
      if (minted?.id === token.id) minted = undefined;
      held = await client.tokens.list();
    }).finally(() => (revoking = undefined));
  };

  async function copy() {
    if (minted === undefined) return;

    try {
      await navigator.clipboard.writeText(minted.token);
      copied = true;
    } catch {
      // A clipboard a browser will not hand over is not a failure worth a
      // refusal: the string is on the screen to be selected either way.
      copied = false;
    }
  }
</script>

<Section name="access">
  <div class="flex flex-col">
    <div>
      {#if who.canSignOut}
        <div class="px-gutter py-4">
          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-control border border-tag-line bg-tag px-4 py-3"
          >
            <span>
              Signed in. This browser holds a session.
              {#if signOutFailed !== undefined}
                <span role="status" class="block text-danger"
                  >{signOutFailed}</span
                >
              {/if}
            </span>
            <Box working={signingOut} onclick={() => void signOut()}
              >Sign out</Box
            >
          </div>
        </div>
      {:else}
        <div class="px-gutter py-4">
          <p
            role="status"
            class="m-0 flex items-start gap-3 rounded-control border border-danger px-4 py-3 text-danger"
          >
            <Icon name="unlock" class="mt-0.5 size-5 flex-none" />
            <span>
              <b>No password.</b> Every request is let through: anyone who
              reaches this pool can read and change everything in it. Run
              <code>notemap password set</code> where the daemon runs to close the
              door.
            </span>
          </p>
        </div>
      {/if}

      {#if who.canSignOut}
        <Band>access tokens</Band>
        {#each held as token (token.id)}
          <div
            class="flex min-h-bar items-center justify-between gap-3 border-b border-rule px-gutter py-2"
          >
            <span class="min-w-0">
              <span class="block">{token.name}</span>
              <small class="block text-small text-muted">{why(token)}</small>
            </span>
            <Box
              danger
              disabled={going}
              working={revoking === token.id}
              onclick={() => void revoke(token)}>Revoke</Box
            >
          </div>
        {:else}
          <p class="m-0 border-b border-rule px-gutter py-3 text-muted">
            No tokens.
          </p>
        {/each}

        {#if minted !== undefined}
          <div class="px-gutter py-4">
            <div
              class="rounded-control border border-danger px-4 py-3"
              role="status"
            >
              <p class="m-0 text-danger">
                Copy now. The token will not be shown again.
              </p>
              <p class="mt-2 mb-0 break-all select-all">{minted.token}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                {#if copyable()}
                  <Box icon="copy" onclick={() => void copy()}
                    >{copied ? "Copied" : "Copy"}</Box
                  >
                {/if}
                <Box icon="check" onclick={() => (minted = undefined)}>Done</Box
                >
              </div>
            </div>
          </div>
        {/if}

        {#if !addingToken}
          <LinkRow
            icon="plus"
            title="Add a token"
            label="Add a token"
            chevron={false}
            onclick={() => (addingToken = true)}
          />
        {:else}
          <form
            onsubmit={mint}
            class="flex flex-wrap items-end gap-2 border-b border-rule px-gutter py-3"
          >
            <label class="min-w-0 flex-1">
              <span class="mb-1.5 block text-small">name</span>
              <input
                id="token-name"
                bind:value={name}
                aria-label="name"
                placeholder="what it is for"
                class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
              />
            </label>
            <Box
              disabled={going || name.trim() === ""}
              working={minting}
              onclick={() =>
                mint(new SubmitEvent("submit", { cancelable: true }))}
              >Create</Box
            >
          </form>
        {/if}

        {#if said !== ""}
          <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
        {/if}
      {/if}
    </div>
  </div>
</Section>
