# memos-vault-sync — Memos → vault inbox sync

One-way sync turning memos into inbox items in the Obsidian vault, replacing the broken plugin route (see [../../docs/flows/fast-notes.md](../../docs/flows/fast-notes.md)). Python 3 stdlib only — no pip, runs from systemd, cron, or a minimal Docker python image unchanged.

### Sync rules

- One markdown file per memo: `inbox/YYYY-MM-DD_HHMM_<uid8>.md` — frontmatter (source, memo uid, created, tags, web-UI url) + memo content verbatim. Attachments are downloaded via the API into `inbox/attachments/` and embedded.
- **Deleting or moving a file in the vault = processed.** The state file remembers the memo was synced; it never comes back…
- …**unless the memo is edited server-side after sync.** Then it resurfaces as a fresh inbox item with an `edited:` frontmatter key and a visible `> ✏️ Edited in Memos…` marker line.
- **User edits are never clobbered:** the script only ever overwrites a file whose content still hashes to exactly what it wrote. A vault-modified file is left alone (the edited memo lands as a separate new file instead).
- Archived memos are skipped. Memos are never modified server-side — strictly read-only against the Memos API.

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

### First run / testing

```bash
# 1. Sanity-check server + token by hand:
curl -s "$MEMOS_URL/api/v1/workspace/profile"
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

Adjust `User=` and the script path in the `.service` file to the deployment location. Runs hourly (`Persistent=true` catches up after downtime).

### Caveats

- **Nextcloud visibility:** the script writes directly into the vault directory. If that directory is Nextcloud *internal* storage, Nextcloud won't notice external writes without an `occ files:scan` cron or the folder being an External Storage mount — same requirement as the planned Speakr auto-export ([../../docs/flows/voice-notes.md](../../docs/flows/voice-notes.md)).
- **Memos API churn:** written against 0.27, with defensive field access (`uid`/`name`, `attachments`/`resources`, `state`/`rowStatus`). Expect a small fix whenever the Memos server is upgraded across a minor version — test with `--dry-run` after upgrades before the timer runs.
- The state file maps memo uid → `{update_time, file, hash}`. Deleting it makes the next run re-import everything (as duplicates if the files still exist) — back it up with the rest of `/var/lib`.
