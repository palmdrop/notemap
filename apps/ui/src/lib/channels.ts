/**
 * A capture channel is finer than the shell, because per-source policy is what
 * makes the distinction worth anything: a voice memo may auto-request
 * transcription where a typed note does not.
 */
export const TYPED = "web-manual";
export const PICTURE = "web-image";

/**
 * Not a capture channel: the identity this shell's edits claim, stamped on
 * every revision they produce. A revision is a capture of whoever made the
 * edit, which is this shell rather than whatever originally captured the note.
 */
export const EDITS = "web-edit";
