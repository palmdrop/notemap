import { MAX_PASSWORD_BYTE_LENGTH } from "./config";
import { UnusablePassword, type PasswordRefusal } from "./errors";

const FORBIDDEN = /[\p{Cc}\p{Cs}]/u;

type Normalised =
  | { ok: true; password: string }
  | { ok: false; refusal: PasswordRefusal };

export const normalise = (password: string): Normalised => {
  if(Buffer.byteLength(password) > MAX_PASSWORD_BYTE_LENGTH) {
    return { ok: false, refusal: "password-too-long" };
  }

  const normalised = password.normalize("NFC");

  if(!normalised) {
    return { ok: false, refusal: "password-empty" };
  }

  if(FORBIDDEN.test(normalised)) {
    return { ok: false, refusal: "password-forbidden-characters" };
  }

  return { ok: true, password: normalised };
}

export const normalisePassword = (password: string) => {
  const result = normalise(password);

  if(!result.ok) {
    throw new UnusablePassword(result.refusal);
  }

  return result.password;
}
