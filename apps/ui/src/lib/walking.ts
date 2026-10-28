/**
 * The entry API, as narrow as a walk needs it: what a browser hands over for a
 * dropped file or folder, and what a test can stand in for.
 */
export type Entry = {
  readonly name: string;
  readonly isDirectory: boolean;
};

type FileEntry = Entry & {
  file(ok: (file: File) => void, fail?: (error: unknown) => void): void;
};

type FolderEntry = Entry & {
  createReader(): {
    readEntries(
      ok: (entries: Entry[]) => void,
      fail?: (error: unknown) => void,
    ): void;
  };
};

/** Where a walk stops, so a folder dropped by accident is never read whole. */
export const CEILING = 500;

export type Walked = {
  readonly files: readonly File[];
  /** Hidden files and folders inside a dropped folder, left out, a folder counting once. */
  readonly hidden: number;
  /** Stopped at the ceiling, with more still unread. */
  readonly over: boolean;
};

/**
 * Every file under what was dropped, folders read through and their own
 * folders with them, in the order each was listed. Something dropped by name
 * is taken whatever it is called; what is hidden inside a folder is not.
 */
export async function walk(
  dropped: readonly (Entry | File)[],
  ceiling = CEILING,
): Promise<Walked> {
  const files: File[] = [];
  let hidden = 0;

  async function visit(entry: Entry): Promise<boolean> {
    if (!entry.isDirectory) {
      if (files.length === ceiling) return false;
      files.push(await fileOf(entry as FileEntry));
      return true;
    }

    for await (const batch of listed(entry as FolderEntry)) {
      for (const inside of batch) {
        if (inside.name.startsWith(".")) {
          hidden += 1;
          continue;
        }
        if (!(await visit(inside))) return false;
      }
    }
    return true;
  }

  for (const one of dropped) {
    if (one instanceof File) {
      if (files.length === ceiling) return { files, hidden, over: true };
      files.push(one);
    } else if (!(await visit(one))) {
      return { files, hidden, over: true };
    }
  }
  return { files, hidden, over: false };
}

function fileOf(entry: FileEntry): Promise<File> {
  return new Promise((ok, fail) => {
    entry.file(ok, fail);
  });
}

/**
 * A reader answers a batch at a time, and an empty batch is the end. Walked
 * as each arrives, so a walk that reaches the ceiling stops listing too.
 */
async function* listed(folder: FolderEntry): AsyncGenerator<Entry[]> {
  const reader = folder.createReader();
  for (;;) {
    const batch = await new Promise<Entry[]>((ok, fail) => {
      reader.readEntries(ok, fail);
    });
    if (batch.length === 0) return;
    yield batch;
  }
}
