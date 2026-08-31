import { parseArgs } from "node:util";

import { DEFAULT_CREDENTIALS_NAME } from "../auth/config";
import { withAuth } from "./open";
import { readPassword, type Streams } from "./prompt";

export async function setPassword(
  argv: string[],
  streams?: Streams,
): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      name: { type: "string" },
    },
    strict: true,
  });

  const password = await readPassword(streams);

  if (password === "") throw new Error("a password of nothing is not one");

  const name = values.name ?? DEFAULT_CREDENTIALS_NAME;

  await withAuth(async (auth) => {
    await auth.setPassword(name, password);

    console.log(`notemap: the password for ${name} is set`);
    console.log("notemap: every session that was open has ended");
  }, values.config);
}
