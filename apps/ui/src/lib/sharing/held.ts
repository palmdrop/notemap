import { wordsOf, type Shared } from "./fold";

/** Where the worker keeps a share until the capture page takes it. */
export const SHARES = "notemap-shares";

const ROOT = "/__shared/";

export type Holding = Pick<Cache, "put" | "keys" | "match" | "delete">;

export type Taken = {
  /** One text per share, oldest first. */
  readonly words: readonly string[];
  readonly files: readonly File[];
};

/** What a share posts, read the way the worker reads it. */
export type Posted = Pick<FormData, "get" | "getAll">;

function stringOf(form: Posted, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

/** A share that came with no file still sends the field, as one empty file with no name. */
function filesOf(form: Posted): File[] {
  return form
    .getAll("files")
    .filter(
      (value): value is File =>
        typeof value !== "string" && (value.size > 0 || value.name !== ""),
    );
}

export async function holdShare(
  form: Posted,
  into: Holding,
  id: string = `${String(Date.now())}-${crypto.randomUUID()}`,
): Promise<void> {
  const shared: Shared = {
    title: stringOf(form, "title"),
    text: stringOf(form, "text"),
    url: stringOf(form, "url"),
  };
  // The files go first and the words last, so a share is not taken until all
  // of it is here: the words are what marks it whole.
  const files = filesOf(form);
  for (const [at, file] of files.entries()) {
    await into.put(
      `${ROOT}${id}/file/${String(at)}`,
      new Response(file, {
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-name": encodeURIComponent(file.name),
        },
      }),
    );
  }
  await into.put(`${ROOT}${id}/words`, Response.json(shared));
}

type Part = {
  readonly request: Request;
  readonly id: string;
  readonly file?: number;
};

function partOf(request: Request): Part | undefined {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ROOT)) return undefined;
  const [id, kind, at] = path.slice(ROOT.length).split("/");
  if (id === undefined || id === "") return undefined;
  if (kind === "words") return { request, id };
  if (kind === "file" && at !== undefined) {
    return { request, id, file: Number(at) };
  }
  return undefined;
}

/**
 * Every share held whole, oldest first, and lets go of each one taken. A share
 * whose words are not written yet is still arriving, and is left for the next
 * time.
 */
export async function takeShares(from: Holding): Promise<Taken> {
  const parts = (await from.keys())
    .map(partOf)
    .filter((part): part is Part => part !== undefined);
  const whole = [
    ...new Set(
      parts.filter((part) => part.file === undefined).map((part) => part.id),
    ),
  ].sort();

  const words: string[] = [];
  const files: File[] = [];

  for (const id of whole) {
    const mine = parts.filter((part) => part.id === id);
    const said = mine.find((part) => part.file === undefined);
    const held = mine
      .filter((part) => part.file !== undefined)
      .sort((a, b) => (a.file ?? 0) - (b.file ?? 0));

    if (said !== undefined) {
      const response = await from.match(said.request);
      const text =
        response === undefined
          ? ""
          : wordsOf((await response.json()) as Shared);
      if (text !== "") words.push(text);
    }

    for (const part of held) {
      const response = await from.match(part.request);
      if (response === undefined) continue;
      const type = response.headers.get("content-type") ?? "";
      const name = decodeURIComponent(response.headers.get("x-name") ?? "");
      files.push(new File([await response.arrayBuffer()], name, { type }));
    }

    for (const part of mine) await from.delete(part.request);
  }

  return { words, files };
}
