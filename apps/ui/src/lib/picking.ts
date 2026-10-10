import { saidBy, type Refused } from "@notemap/client";

import { client } from "./client";

export type Sorted = {
  readonly taken: readonly File[];
  readonly said: string;
};

/**
 * The files the pool would take, and what it would say of the ones it would
 * not, by name. Asked where a file is picked and again where it is sent: the
 * limit may have been learned in between, or a refused capture put back with
 * the file that was refused.
 */
export function sorted(offered: readonly File[]): Sorted {
  const taken: File[] = [];
  const refused: { readonly file: File; readonly refusal: Refused }[] = [];

  for (const file of offered) {
    const refusal = client.refuses(file);
    if (refusal === undefined) taken.push(file);
    else refused.push({ file, refusal });
  }

  const [first] = refused;
  return {
    taken,
    said:
      first === undefined
        ? ""
        : `${refused.map((each) => each.file.name).join(", ")}: ${saidBy(first.refusal)}`,
  };
}
