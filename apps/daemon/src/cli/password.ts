import { Writable } from "node:stream";
import { parseArgs } from "node:util"
import { withAuth } from "./open";
import { DEFAULT_CREDENTIALS_NAME } from "../auth/config";
import { createInterface } from "node:readline/promises";

const askSecretly = async (prompt: string): Promise<string> => {
  let muted = false;
  const output = new Writable({
    write: (chunk, encoding, callback) => {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    }
  });

  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  const answer = rl.question(prompt);
  muted = true;

  try {
    return await answer;
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}

const readPassword = async (): Promise<string> => {
  let attempts = 10;
  while (attempts > 0) {
    const password = await askSecretly("Input password: ");
    const confirmation = await askSecretly("Confirm password: ");
    if (password === confirmation) return password;

    attempts--;
  }

  throw new Error("Failed to input password!");
}


export async function setPassword(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,  
    options: {
      config: { type: "string" },
      name: { type: "string" },
    },
    strict: true
  })

  const password = await readPassword();

  await withAuth(async (auth) => {
    await auth.setPassword(values.name ?? DEFAULT_CREDENTIALS_NAME, password);
  }, values.config);
}