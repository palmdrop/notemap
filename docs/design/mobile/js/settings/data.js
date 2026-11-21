// What settings holds in this design: the kinds of destination and account the daemon offers,
// with the fields each asks for, and the destinations, templates and accounts made from them.

export const DESTINATION_KINDS = {
  filesystem: {
    label: "markdown folder", icon: "folder", files: true,
    fields: [
      { key: "root", label: "folder", type: "text", required: true, hint: "On the server. It is never made: a missing one is more often an unplugged drive than a typo." },
      { key: "frontmatter", label: "frontmatter", type: "choice", options: ["none", "full"], implied: "none" },
      { key: "hashtags", label: "hashtags", type: "choice", options: ["no", "yes"], implied: "no", hint: "Tags as #tag at the foot of a note, rather than in its frontmatter." },
    ],
  },
  webdav: {
    label: "webdav", icon: "cloud", files: true,
    fields: [
      { key: "account", label: "account", type: "account", required: true },
      { key: "root", label: "folder", type: "text", hint: "Under the account's own. Left blank, it is the account's folder itself." },
      { key: "frontmatter", label: "frontmatter", type: "choice", options: ["none", "full"], implied: "none" },
      { key: "hashtags", label: "hashtags", type: "choice", options: ["no", "yes"], implied: "no" },
    ],
  },
  arena: {
    label: "are.na", icon: "grid", files: false,
    fields: [{ key: "account", label: "account", type: "account", required: true }],
  },
};

export const ACCOUNT_KINDS = {
  webdav: { label: "webdav", secret: "password", fields: [
    { key: "address", label: "address", type: "text", required: true, placeholder: "https://" },
    { key: "username", label: "username", type: "text", required: true },
  ] },
  arena: { label: "are.na", secret: "token", fields: [
    { key: "username", label: "username", type: "text" },
  ] },
};

// What a template can ask a destination to do, by whether the destination writes files.
export const ACTIONS = {
  files: [
    { id: "create", label: "new note", folders: true, fields: [
      { key: "folder", label: "folder", type: "listed", required: true, from: "folders" },
      { key: "name", label: "file name", type: "pattern", hint: "Left blank, the item's first words." },
      { key: "shape", label: "shape", type: "choice", options: ["raw", "task", "list"], implied: "raw" },
    ] },
    { id: "append", label: "append", folders: true, fields: [
      { key: "file", label: "file", type: "listed", required: true, from: "files" },
      { key: "heading", label: "under", type: "listed", from: "headings" },
      { key: "shape", label: "shape", type: "choice", options: ["raw", "task", "list"], implied: "raw" },
    ] },
  ],
  blocks: [
    { id: "block", label: "add a block", output: true, fields: [
      { key: "channel", label: "channel", type: "listed", required: true, from: "channels", offeredOnly: true },
    ] },
  ],
};

// What a destination offers when a field is listed: read from the place itself.
export const OFFERED = {
  folders: ["seeded/", "journal/", "projects/", "reading/"],
  files: ["todo.md", "reading.md", "journal/2026-11.md", "projects/notemap.md", "projects/garden.md"],
  headings: ["## Inbox", "## Next", "## Waiting on", "## Ideas", "## Questions"],
  channels: ["seeded", "reading", "street"],
};

export const PATTERNS = ["{{captured_at}}", "{{captured_at:month}}", "{{captured_at:week}}", "{{item}}", "{{source}}"];

export const FOLDER_MODES = [
  ["create", "Make it"],
  ["require", "Must exist"],
  ["establish", "Make it once, then must exist"],
];

export const KNOWN_ROOTS = ["~/notes/vault", "~/notes/old"];

export const destinations = [
  { id: "vault", name: "Vault", kind: "filesystem", reach: "available", checked: "2 min ago",
    values: { root: "~/notes/vault", frontmatter: "full", hashtags: "no" } },
  { id: "cloud", name: "Cloud", kind: "webdav", reach: "unavailable", why: "the password was not accepted", checked: "2 min ago",
    values: { account: "cloud", root: "notes", frontmatter: "none", hashtags: "yes" } },
  { id: "board", name: "Board", kind: "arena", reach: "available", checked: "2 min ago", values: { account: "are.na" } },
  { id: "old", name: "Old vault", kind: "filesystem", reach: "disabled", values: { root: "~/notes/old" } },
  { id: "jotter", name: "Jotter", kind: "jotter", reach: "unusable", values: {} },
];

export const templates = [
  { id: "todo", name: "Todo", tag: "todo", to: "vault", action: "append", folder: "create",
    values: { file: "todo.md", shape: "task" }, asked: { heading: "Which list?" }, used: "14 times, last yesterday" },
  { id: "project", name: "Project note", to: "vault", action: "append", folder: "establish", established: "2026-10-12",
    values: { shape: "list" }, asked: { file: "Which project?", heading: "Under which heading?" }, used: "3 times, last 2026-11-01" },
  { id: "vault", name: "To the vault", tag: "vault", to: "vault", action: "create", folder: "create",
    values: { folder: "seeded/" }, asked: {}, used: "22 times, last today" },
  { id: "cloud", name: "To the cloud", tag: "cloud", to: "cloud", action: "create", folder: "create",
    values: { folder: "seeded/" }, asked: {}, used: "2 times, last 2026-10-28" },
  { id: "board", name: "To the board", tag: "board", to: "board", action: "block", output: "everything",
    values: { channel: "seeded" }, asked: {}, used: "nothing yet" },
  { id: "jot", name: "Jot it", tag: "jot", to: "jotter", action: "create", folder: "create",
    values: { folder: "inbox/" }, asked: {}, used: "9 times, last 2026-09-02" },
];

export const accounts = [
  { id: "cloud", kind: "webdav", name: "cloud", from: "stored", values: { address: "https://cloud.example.org/dav", username: "admin" } },
  { id: "arena", kind: "arena", name: "are.na", from: "config", values: { username: "admin" } },
];

export const destinationOf = (id) => destinations.find((d) => d.id === id);
// A destination of a kind the pool no longer has is kept, to be read and deleted, and used by nothing.
export const kindOf = (d) => DESTINATION_KINDS[d.kind] ?? { label: `${d.kind}, a kind this pool no longer has`, icon: "file", files: true, fields: [], unusable: true };
export const actionsFor = (d) => (kindOf(d).files ? ACTIONS.files : ACTIONS.blocks);
export const actionOf = (t) => actionsFor(destinationOf(t.to)).find((a) => a.id === t.action);
export const pointing = (d) => templates.filter((t) => t.to === d.id);

export function placeOf(t) {
  const v = t.values;
  const at = (key) => (t.asked[key] ? `{${key}}` : v[key]);
  if (t.action === "append") return at("file") ?? "";
  if (t.action === "create") return `${at("folder") ?? ""}${at("name") ?? ""}`;
  return at("channel") ?? "";
}

export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new";
