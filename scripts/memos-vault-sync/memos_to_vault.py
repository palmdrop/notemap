#!/usr/bin/env python3
"""One-way sync: Memos server -> Obsidian vault inbox.

Each memo becomes one markdown file in the inbox folder. Deleting or moving
the file in the vault marks the memo as processed: it is never re-synced,
unless the memo is edited server-side afterwards, in which case it resurfaces
as a fresh inbox item carrying an "edited" marker. User-modified files are
never overwritten.

Stdlib only. Configured via environment variables (see scripts/README.md).
Written against Memos 0.27 (/api/v1/memos); field access is defensive because
Memos renames API fields between minor versions.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

STATE_VERSION = 1
EMBEDDABLE = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp",
              ".m4a", ".mp3", ".ogg", ".wav", ".flac", ".webm", ".mp4", ".mov", ".pdf"}


def env(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and not value:
        sys.exit(f"error: {name} is not set")
    return value


def load_config():
    token = env("MEMOS_TOKEN")
    token_file = env("MEMOS_TOKEN_FILE")
    if not token and token_file:
        token = Path(token_file).read_text().strip()
    if not token:
        sys.exit("error: MEMOS_TOKEN or MEMOS_TOKEN_FILE is not set")
    base_url = env("MEMOS_URL", required=True).rstrip("/")
    return {
        "base_url": base_url,
        "web_url": env("MEMOS_WEB_URL", base_url).rstrip("/"),
        "token": token,
        "inbox_dir": Path(env("VAULT_INBOX_DIR", required=True)),
        "state_file": Path(env("STATE_FILE", required=True)),
        "attachments_subdir": env("ATTACHMENTS_SUBDIR", "attachments"),
        "page_size": int(env("PAGE_SIZE", "1000")),  # API max; fewer round trips on full scan
    }


def api_get(cfg, path, params=None, raw=False):
    url = f"{cfg['base_url']}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {cfg['token']}",
        "Accept": "*/*" if raw else "application/json",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
    return body if raw else json.loads(body)


def fetch_memos(cfg, log):
    """All non-archived memos visible to the token's account, oldest first."""
    memos, page_token = [], ""
    while True:
        params = {"pageSize": cfg["page_size"]}
        if page_token:
            params["pageToken"] = page_token
        data = api_get(cfg, "/api/v1/memos", params)
        memos.extend(data.get("memos", []))
        page_token = data.get("nextPageToken", "")
        if not page_token:
            break
    log(f"fetched {len(memos)} memos from server")
    kept = [m for m in memos if memo_state(m) == "NORMAL"]
    kept.sort(key=lambda m: memo_time(m))
    return kept


# --- defensive accessors: Memos renames these fields between versions ---

def memo_uid(memo):
    uid = memo.get("uid")
    if not uid:
        uid = memo.get("name", "").split("/")[-1]
    return uid


def memo_state(memo):
    state = memo.get("state") or memo.get("rowStatus") or "NORMAL"
    return "NORMAL" if state in ("NORMAL", "STATE_UNSPECIFIED") else state


def memo_time(memo, field="displayTime"):
    stamp = memo.get(field) or memo.get("createTime") or ""
    return datetime.fromisoformat(stamp.replace("Z", "+00:00"))


def memo_tags(memo):
    tags = memo.get("tags") or (memo.get("property") or {}).get("tags") or []
    if not tags:
        tags = re.findall(r"#([\w/\-]+)", memo.get("content", ""), re.UNICODE)
    return sorted(set(tags))


def memo_attachments(memo):
    return memo.get("attachments") or memo.get("resources") or []


# --- rendering ---

def render_note(cfg, memo, edited=False):
    uid = memo_uid(memo)
    created = memo_time(memo).astimezone()
    tags = memo_tags(memo)
    lines = ["---",
             "source: memos",
             f"memo: {uid}",
             f"created: {created.isoformat()}"]
    if tags:
        lines.append(f"tags: [{', '.join(tags)}]")
    lines.append(f"url: {cfg['web_url']}/m/{uid}")
    if edited:
        lines.append(f"edited: {datetime.now().astimezone().date().isoformat()}")
    lines.append("---")
    if edited:
        stamp = memo_time(memo, "updateTime").astimezone().strftime("%Y-%m-%d %H:%M")
        lines.append(f"> ✏️ Edited in Memos after last sync — {stamp}")
        lines.append("")
    lines.append(memo.get("content", "").rstrip())
    return "\n".join(lines) + "\n", created


def attachment_lines(cfg, memo, log, dry_run):
    """Download attachments beside the inbox; return embed/link lines."""
    lines = []
    subdir = cfg["attachments_subdir"]
    if not subdir:
        return lines
    for att in memo_attachments(memo):
        filename = att.get("filename") or att.get("name", "attachment").split("/")[-1]
        local_name = f"{memo_uid(memo)[:8]}_{filename}"
        target = cfg["inbox_dir"] / subdir / local_name
        external = att.get("externalLink")
        if external:
            lines.append(f"[{filename}]({external})")
            continue
        if not target.exists() and not dry_run:
            att_name = att.get("name", "")  # "attachments/{id}" or "resources/{id}"
            quoted = urllib.parse.quote(filename)
            try:
                blob = api_get(cfg, f"/file/{att_name}/{quoted}", raw=True)
            except (urllib.error.URLError, urllib.error.HTTPError) as exc:
                log(f"  attachment {filename}: download failed ({exc}), linking instead")
                lines.append(f"[attachment: {filename}]({cfg['web_url']}/{att_name})")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_bytes(target, blob)
            log(f"  attachment saved: {target.name}")
        if Path(filename).suffix.lower() in EMBEDDABLE:
            lines.append(f"![[{local_name}]]")
        else:
            lines.append(f"[[{local_name}]]")
    return lines


# --- filesystem ---

def atomic_write_bytes(path, data):
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def unique_path(directory, stem):
    path = directory / f"{stem}.md"
    counter = 2
    while path.exists():
        path = directory / f"{stem}_{counter}.md"
        counter += 1
    return path


def write_note(cfg, memo, log, dry_run, edited=False):
    body, created = render_note(cfg, memo, edited=edited)
    extra = attachment_lines(cfg, memo, log, dry_run)
    if extra:
        body += "\n" + "\n".join(extra) + "\n"
    data = body.encode()
    stem = f"{created.strftime('%Y-%m-%d_%H%M')}_{memo_uid(memo)[:8]}"
    path = unique_path(cfg["inbox_dir"], stem)
    if not dry_run:
        cfg["inbox_dir"].mkdir(parents=True, exist_ok=True)
        atomic_write_bytes(path, data)
    return path.name, sha256(data)


def load_state(path):
    if path.exists():
        return json.loads(path.read_text())
    return {"version": STATE_VERSION, "memos": {}}


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(path, json.dumps(state, indent=1).encode())


# --- sync ---

def sync(cfg, dry_run, log):
    try:
        profile = api_get(cfg, "/api/v1/workspace/profile")
        log(f"server version: {profile.get('version', 'unknown')}")
    except (urllib.error.URLError, urllib.error.HTTPError) as exc:
        sys.exit(f"error: cannot reach Memos at {cfg['base_url']}: {exc}")

    state = load_state(cfg["state_file"])
    known = state["memos"]
    new = updated = skipped = 0

    for memo in fetch_memos(cfg, log):
        uid = memo_uid(memo)
        update_time = memo.get("updateTime", "")
        entry = known.get(uid)

        if entry is None:
            filename, digest = write_note(cfg, memo, log, dry_run)
            known[uid] = {"update_time": update_time, "file": filename, "hash": digest}
            log(f"new: {filename}")
            new += 1
            continue

        if entry["update_time"] == update_time:
            skipped += 1
            continue

        # Memo edited server-side since last sync.
        existing = cfg["inbox_dir"] / entry["file"]
        untouched = existing.exists() and sha256(existing.read_bytes()) == entry["hash"]
        if untouched and not dry_run:
            existing.unlink()  # replaced below by a fresh write under a stable name
        if existing.exists() and not untouched:
            log(f"edited memo {uid}: {entry['file']} was modified in the vault; "
                "leaving it alone, writing a new inbox item")
        filename, digest = write_note(cfg, memo, log, dry_run, edited=True)
        known[uid] = {"update_time": update_time, "file": filename, "hash": digest}
        log(f"edited: {filename}")
        updated += 1

    if not dry_run:
        save_state(cfg["state_file"], state)
    prefix = "[dry-run] " if dry_run else ""
    print(f"{prefix}sync done: {new} new, {updated} edited, {skipped} unchanged")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be written without touching vault or state")
    parser.add_argument("--verbose", action="store_true", help="log per-memo detail")
    args = parser.parse_args()

    def log(message):
        if args.verbose:
            print(message)

    sync(load_config(), args.dry_run, log)


if __name__ == "__main__":
    main()
