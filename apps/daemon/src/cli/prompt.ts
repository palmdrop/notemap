import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

/**
 * Injected rather than reached for, so the prompt can be driven by a test that
 * has no terminal — which is the same reason the piped path exists at all.
 */
export type Streams = {
  readonly input: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly output: NodeJS.WritableStream;
};

export const processStreams = (): Streams => ({
  input: process.stdin,
  output: process.stdout,
});

const CONFIRMATIONS = 3;

/** Draws the prompt and nothing typed in answer to it. */
export const askSecretly = async (
  prompt: string,
  { input, output }: Streams,
): Promise<string> => {
  let muted = false;

  const quiet = new Writable({
    write: (chunk: Buffer, _encoding, done) => {
      if (!muted) output.write(chunk);
      done();
    },
  });

  const reader = createInterface({ input, output: quiet, terminal: true });

  // `question` writes the prompt as it is called, so the muting closes
  // immediately behind it and stays shut until the answer is in.
  const answer = reader.question(prompt);
  muted = true;

  try {
    return await answer;
  } finally {
    reader.close();
    output.write("\n");
  }
};

/**
 * The whole of stdin, less the newline the shell adds. A password arriving this
 * way cannot be confirmed by asking again, so it is taken as given.
 */
const readPiped = async (input: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.from(chunk));

  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
};

const askTwice = async (streams: Streams): Promise<string> => {
  for (let attempt = 0; attempt < CONFIRMATIONS; attempt += 1) {
    const password = await askSecretly("Password: ", streams);

    if (password === (await askSecretly("Confirm: ", streams))) return password;

    streams.output.write("They did not match.\n");
  }

  throw new Error("the password was not confirmed");
};

export const readPassword = async (
  streams: Streams = processStreams(),
): Promise<string> =>
  streams.input.isTTY === true ? askTwice(streams) : readPiped(streams.input);
