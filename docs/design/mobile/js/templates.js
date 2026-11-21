// The routing templates the design knows, for the quick sheet and for trigger tags wherever a tag
// can be added.

export const TEMPLATES = [
  { name: "Todo", tag: "route/todo", icon: "file", dest: "Vault", place: "todo.md", ask: ["Inbox", "Next", "Waiting on", "Someday"] },
  { name: "To the vault", tag: "route/vault", icon: "folder", dest: "Vault", place: "seeded/" },
  { name: "To the cloud", tag: "route/cloud", icon: "cloud", dest: "Cloud", place: "seeded/" },
  { name: "To the board", tag: "route/board", icon: "grid", dest: "Board", place: "seeded" },
  { name: "Project note", icon: "file", dest: "Vault", place: "projects/", page: true },
];

export const templateOf = (tag) => TEMPLATES.find((t) => t.tag === tag);
