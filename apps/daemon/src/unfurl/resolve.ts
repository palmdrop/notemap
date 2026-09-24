import { lookup } from "node:dns/promises";

import type { Address, Resolve } from "./types";

export const systemResolve: Resolve = async (hostname) => {
  const answers = await lookup(hostname, { all: true, order: "verbatim" });
  return answers.flatMap((answer): Address[] =>
    answer.family === 4 || answer.family === 6
      ? [{ address: answer.address, family: answer.family }]
      : [],
  );
};
