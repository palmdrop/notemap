const LABELS: Readonly<Record<string, string>> = {
  unfurl: "show link previews",
};

/** A setting this shell has no words for is shown by its name. */
export function poolSettingLabel(name: string): string {
  return LABELS[name] ?? name;
}
