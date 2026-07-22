# memos-vault-sync — Memos → vault inbox sync

One-way sync turning memos into inbox items in the Obsidian vault, replacing the broken plugin route (see [../../docs/flows/fast-notes.md](../../docs/flows/fast-notes.md)). Python 3 stdlib only — no pip, runs from systemd, cron, or a minimal Docker python image unchanged.

### Sync rules

- One markdown file per memo: `inbox/YYYY-MM-DD_HHMM_<uid8>.md` — frontmatter (source, memo uid, created, tags, web-UI url) + memo content verbatim. Attachments are downloaded via the API into `inbox/attachments/` and embedded.
- **Deleting or moving a file in the vault = processed.** The state file remembers the memo was synced; it never comes back…
- …**unless the memo is edited server-side after sync.** Then it resurfaces as a fresh inbox item with an `edited:` frontmatter key and a visible `> ✏️ Edited in Memos…` marker line.
- **User edits are never clobbered:** the script only ever overwrites a file whose content still hashes to exactly what it wrote. A vault-modified file is left alone (the edited memo lands as a separate new file instead).
- Archived memos are skipped. Memos are never modified server-side — strictly read-only against the Memos API.

### Incremental sync

Each run only fetches memos updated since the previous run, via a server-side CEL filter (`updated_ts >= now() - <seconds>`) — so cost stays flat as the memo history grows. The window is the time elapsed since the last sync **plus `GRACE_SECONDS`**, which covers memos landing mid-sync and clock jitter; because dedup skips already-synced memos with no file I/O, overlap is free, so the window errs wide. `now()` is evaluated on the server, so client/server clock skew is irrelevant.

- **First run is always full** (no state yet), as is any run with `--full`.
- **Downtime is self-healing:** the window widens to cover the whole gap, and the `Persistent=true` timer runs a catch-up after downtime.
- **Deletes still stick:** a memo deleted from the vault only reappears if it is *edited* server-side (which pulls it back into the window). An old, unchanged, deleted memo is never re-fetched.
- **Reconciliation safety net:** because incremental relies on the filter behaving, run `--full` periodically (e.g. a weekly timer, or `OnCalendar=weekly` copy of the unit with `--full` added to `ExecStart`) so any filter regression after a Memos upgrade can only *delay* a memo by a week, never lose it. Verify the filter still works after upgrades with `--full --dry-run` vs. a plain `--dry-run`.

### Configuration

All via environment variables — see [memos-vault-sync.env.example](memos-vault-sync.env.example):

| Variable | Required | Meaning |
|---|---|---|
| `MEMOS_URL` | yes | Memos API base URL |
| `MEMOS_TOKEN` / `MEMOS_TOKEN_FILE` | one of | access token (Settings → My Account → Access Tokens) |
| `VAULT_INBOX_DIR` | yes | vault folder to write into |
| `STATE_FILE` | yes | sync-state JSON — **must live outside the vault** |
| `MEMOS_WEB_URL` | no | public UI base for frontmatter links (default: `MEMOS_URL`) |
| `ATTACHMENTS_SUBDIR` | no | attachment folder under inbox (default `attachments`; empty = link only) |
| `PAGE_SIZE` | no | API page size (default 1000, the server max) |
| `GRACE_SECONDS` | no | extra lookback added to the incremental window (default 600) |

Flags: `--dry-run` (touch nothing), `--full` (scan all memos, skip the incremental window), `--verbose` (per-memo logging; also prints the filter and fetch counts).

### First run / testing

```bash
# 1. Sanity-check server + token by hand (this is also the script's health check):
curl -s -H "Authorization: Bearer $TOKEN" "$MEMOS_URL/api/v1/memos?pageSize=1"

# 2. Dry run — prints what would be written, touches nothing:
MEMOS_URL=… MEMOS_TOKEN=… VAULT_INBOX_DIR=… STATE_FILE=… \
  python3 memos_to_vault.py --dry-run --verbose

# 3. Real run, then check the inbox folder in Obsidian.
```

Test the full lifecycle once: sync → delete a file in Obsidian → re-run (must stay deleted) → edit that memo in Memos → re-run (must resurface with the ✏️ marker).

### Install as systemd timer (Fedora)

```bash
sudo cp memos-vault-sync.{service,timer} /etc/systemd/system/
sudo cp memos-vault-sync.env.example /etc/memos-vault-sync.env  # then edit + chmod 600
sudo systemctl daemon-reload
sudo systemctl enable --now memos-vault-sync.timer
systemctl start memos-vault-sync.service   # run once now
journalctl -u memos-vault-sync.service     # logs
```

Adjust the script path in the `.service` file to the deployment location. Runs hourly (`Persistent=true` catches up after downtime).

**Running as the Nextcloud uid.** The unit runs as `User=33` / `Group=33` — the uid:gid Nextcloud owns vault files with inside its container (www-data), so synced files land with ownership Nextcloud accepts (on the host uid 33 may have no name and gid 33 may show as e.g. `tape`; only the numbers matter). Because the process then runs *as* uid 33, everything it touches must be reachable by that uid — this is the part that actually bites:

- **Token file** (`MEMOS_TOKEN_FILE`): read by the script as uid 33, so it must be readable by 33 — `sudo chown 33:33 /etc/memos-vault-sync.token && sudo chmod 600 /etc/memos-vault-sync.token`. (The `EnvironmentFile` itself is read by systemd as root before dropping privileges, so it can stay `root:root 600`.)
- **State dir** (`STATE_FILE`'s directory): must be writable by 33 — `sudo install -d -o 33 -g 33 /var/lib/memos-vault-sync`.
- **Inbox dir** (`VAULT_INBOX_DIR`): already 33-owned if Nextcloud created it; otherwise `chown` it so the script can write.
- Files are created mode 0600 owned 33:33; since Nextcloud runs as 33 that is sufficient. Still run `occ files:scan` (or use an External Storage mount) so Nextcloud indexes the external writes.

### Caveats

- **Nextcloud visibility:** the script writes directly into the vault directory. If that directory is Nextcloud *internal* storage, Nextcloud won't notice external writes without an `occ files:scan` cron or the folder being an External Storage mount — same requirement as the planned Speakr auto-export ([../../docs/flows/voice-notes.md](../../docs/flows/voice-notes.md)).
- **Memos API churn:** written against 0.27, with defensive field access (`uid`/`name`, `attachments`/`resources`, `state`/`rowStatus`). Expect a small fix whenever the Memos server is upgraded across a minor version — test with `--dry-run` after upgrades before the timer runs.
- The state file (v2) holds `last_sync_start` plus a memo uid → `{update_time, file, hash}` map. Deleting it makes the next run a full re-import (duplicates if the files still exist) — back it up with the rest of `/var/lib`. A v1 state (no `last_sync_start`) is upgraded automatically: the first run after upgrade is full.
- **Incremental depends on the `updated_ts` CEL filter working on your server.** If a future Memos version changes or silently ignores it, incremental runs would quietly fetch nothing; the periodic `--full` run above is the backstop.
