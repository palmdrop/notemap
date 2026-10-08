import { placeOf } from "@notemap/output-markdown/naming";

import { fieldsOf } from "$lib/schema-form";

type Schema = Record<string, unknown> | undefined;

/** The folder an argument set names, read through the capability's own path fields. */
export function folderIn(
  schema: Schema,
  args: Readonly<Record<string, string>>,
): string {
  const fields = fieldsOf(schema);

  const whole = fields.find((field) => field.path === true)?.name;
  if (whole !== undefined) return placeOf(args[whole] ?? "").directory;

  const folders = fields.find((field) => field.path === "folders")?.name;
  return folders === undefined ? "" : (args[folders] ?? "").replace(/\/+$/, "");
}

/**
 * The same argument set naming another folder, and keeping whatever else it
 * held — the name a whole path ends in included. A capability with no path
 * field gets it back as it was.
 */
export function withFolder(
  schema: Schema,
  args: Readonly<Record<string, string>>,
  folder: string,
): Record<string, string> {
  const fields = fieldsOf(schema);
  const field =
    fields.find((one) => one.path === true) ??
    fields.find((one) => one.path === "folders");
  if (field === undefined) return { ...args };

  const value =
    field.path === true
      ? [folder, placeOf(args[field.name] ?? "").filename ?? ""]
          .filter((part, at) => part !== "" || at === 1)
          .join("/")
      : folder;

  const { [field.name]: _held, ...rest } = args;
  return value === "" ? rest : { ...rest, [field.name]: value };
}
