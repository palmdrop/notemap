# @notemap/destination-fs

A **destination** that is a folder on disk — a vault, a notes directory, a synced folder. It
declares two capabilities, renders a delivery as CommonMark with YAML frontmatter, and writes the
assets beside the note under the names they were uploaded with.

## The two capabilities

`create` targets `{ directory, filename? }`.

`directory` is required and may be empty, which names the root itself. `filename` is optional
because a person filing one item often wants to name the note and a person clearing a queue does
not — so the adapter derives one when it is absent. The derivation is **weak, and knowingly**: the
domain has no title, so it is the first line of the longest string the payload carries, sanitised
and truncated, and the item id when there is no prose at all. That is serviceable for text and ugly
for everything else.

A filename that is given is used as written, resolved under `directory`. Nothing is appended to it:
a name with no extension gets no `.md`, because guessing at somebody's file naming is the kind of
help nobody asked for.

`append` targets `{ path, heading? }`.

The fragment lands at the end of the named heading's section, or at the end of the file when no
heading is named. **A heading that is not there is written**, and so is the file: the motivating
case is a daily note whose sections appear as things are filed into them.

An appended fragment carries **no frontmatter** — it is going into somebody else's file, which has
its own. A file this adapter creates because it was missing gets the frontmatter, since the whole
file is then ours.

## What it will not do

- **Nothing escapes the root.** A target is resolved and compared against the root's real path,
  rather than inspected for `..`; and the deepest part of the path that exists is read back through
  the filesystem, so a symlink pointing out is caught as well. An absolute target, any arrangement
  of `..`, and a link out of the vault are all refused.
- **Nothing is overwritten.** A note whose name is taken is refused — the kernel answers `EEXIST`
  rather than this adapter looking first, so two creates racing leave one note and one refusal.
  That is this kind's promise and not `create`'s: the capability says a new thing rather than an
  addition to one, and a kind whose protocol offers no conditional create cannot promise more. An
  asset whose name is taken — by another asset in the same delivery, or by a file the vault already
  had — is written under `name-1`, `name-2`, and so on, keeping the extension. A file is created
  with `link` rather than `rename` precisely because `link` refuses an existing name where `rename`
  replaces it silently.
- **A partial file is never visible.** Everything is written to a temporary file in the target's own
  directory, synced, and then linked or renamed into place.
- **A symlink is never replaced.** Appending resolves the target first, so a note that is a link
  into a dated folder gets the fragment in the real file and stays a link. One pointing out of the
  root is refused before any of that.
- **The root is never created.** A root that is not there is reported as unreachable, so the
  delivery is retried rather than a folder being conjured where somebody's vault was meant to be.

## Refused, or unreachable

The distinction decides whether a delivery is retried, so it is not about severity:

| What happened | Reported as | Because |
|---|---|---|
| The root is missing, unreadable or unwritable | `unreachable` | An unmounted drive comes back |
| The disk is full, or the filesystem is read-only | `unreachable` | Same shape of problem |
| The target escapes the root | `rejected` | No later attempt makes it legal |
| The file is already there | `rejected` | It will be there next time too |
| The target is not the shape the capability declared | `rejected` | Likewise |
| A renderer threw | `rejected` | It will throw identically |

A permission error is reported as unreachable although a permission bit does not fix itself. The
asymmetry decides it: wrongly retrying one is bounded by `maxAttempts` and ends up abandoned in
front of a person, which is where it was going anyway, while wrongly abandoning an unmounted vault
throws away a decision somebody made.

## One writer per file, and who is outside that promise

Section handling is a line walk with a regular expression rather than a Markdown parser, so a `#`
inside a fenced code block reads as a heading. Moving it onto a real Markdown library is a `TODO` in
`sections.ts`.

Appending reads the file, inserts, and writes it back. **This is not atomic against a concurrent
editor.** One writer per file is the standing rule and this adapter is it, but a person with the
vault open in an editor is outside that promise: their unsaved buffer will overwrite whatever
landed, and nothing here can prevent it. Route into a file you are editing and you may lose the
fragment.

Creating a file is not exposed to this — a file that is already there is refused rather than
touched.

## Rendering

The note itself — the renderers, the frontmatter, the derived filename, section insertion and the
naming — is [`@notemap/output-markdown`](../../output-markdown/README.md), so that a vault reached
over WebDAV gets the same note as one on disk. What is left here is what is genuinely about a
filesystem: containment against a real root through symlinks, and the temporary-then-`link`
placement.

Renderers are wired by the host, by payload type, and reach this adapter through its config.
