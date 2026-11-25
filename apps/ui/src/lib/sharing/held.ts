import { wordsOf, type Shared } from "./fold";

/** Where the worker keeps a share until the capture page takes it. */
export const SHARES = "notemap-shares";

const ROOT = "/__shared/";

export type Holding = Pick<Cache, "put" | "keys" | "match" | "delete">;

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
  readonly kind: "words" | "folded" | "file";
  readonly file?: number;
};

function partOf(request: Request): Part | undefined {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ROOT)) return undefined;
  const [id, kind, at] = path.slice(ROOT.length).split("/");
  if (id === undefined || id === "") return undefined;
  if (kind === "words" || kind === "folded") return { request, id, kind };
  if (kind === "file" && at !== undefined) {
    return { request, id, kind, file: Number(at) };
  }
  return undefined;
}

/** How long a share may sit with files and no words before it is taken as one that never finished. */
export const STALE = 24 * 60 * 60 * 1000;

/** A file a share brought, and where it is kept until the draft lets go of it. */
export type SharedFile = { readonly file: File; readonly at: string };

export type Share = {
  readonly id: string;
  /** Its words while they are not yet in the draft; absent once folded in. */
  readonly words?: string;
  readonly files: readonly SharedFile[];
};

function bornAt(id: string): number {
  return Number(id.split("-")[0]);
}

async function letGo(from: Holding, parts: readonly Part[]): Promise<void> {
  for (const part of parts) await from.delete(part.request);
}

/**
 * Every share held whole, oldest first, without letting go of any: its words
 * go once they are in the draft, its files once the draft no longer holds
 * them. A share whose words are not written yet is still arriving and is left,
 * unless it has been arriving for a day; one that cannot be read, or that is
 * folded in with no file left, is let go of here.
 */
export async function readShares(
  from: Holding,
  now: number = Date.now(),
): Promise<readonly Share[]> {
  const parts = (await from.keys())
    .map(partOf)
    .filter((part): part is Part => part !== undefined);
  const ids = [...new Set(parts.map((part) => part.id))].sort();

  const shares: Share[] = [];
  for (const id of ids) {
    const mine = parts.filter((part) => part.id === id);
    const said = mine.find((part) => part.kind === "words");
    const folded = mine.some((part) => part.kind === "folded");
    const held = mine
      .filter((part) => part.kind === "file")
      .sort((a, b) => (a.file ?? 0) - (b.file ?? 0));

    if (said === undefined && !folded) {
      if (now - bornAt(id) > STALE) await letGo(from, mine);
      continue;
    }
    if (said === undefined && held.length === 0) {
      await letGo(from, mine);
      continue;
    }

    try {
      let words: string | undefined;
      if (said !== undefined) {
        const response = await from.match(said.request);
        words =
          response === undefined
            ? ""
            : wordsOf((await response.json()) as Shared);
      }
      const files: SharedFile[] = [];
      for (const part of held) {
        const response = await from.match(part.request);
        if (response === undefined) continue;
        const type = response.headers.get("content-type") ?? "";
        const name = decodeURIComponent(response.headers.get("x-name") ?? "");
        files.push({
          file: new File([await response.arrayBuffer()], name, { type }),
          at: part.request.url,
        });
      }
      shares.push(words === undefined ? { id, files } : { id, words, files });
    } catch {
      await letGo(from, mine);
    }
  }
  return shares;
}

/** Marks a share's words as in the draft, so they are never added twice. */
export async function fold(from: Holding, id: string): Promise<void> {
  await from.put(`${ROOT}${id}/folded`, new Response(null));
  await from.delete(`${ROOT}${id}/words`);
}
