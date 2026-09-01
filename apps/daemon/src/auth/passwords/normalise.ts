import { MAX_PASSWORD_BYTE_LENGTH, MIN_PASSWORD_LENGTH } from "./config";
import { UnusablePassword, type PasswordRefusal } from "./errors";

const FORBIDDEN = /[\p{Cc}\p{Cs}]/u;

type Normalised =
  { ok: true; password: string } | { ok: false; refusal: PasswordRefusal };

export const normalise = (password: string): Normalised => {
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTE_LENGTH) {
    return { ok: false, refusal: "password-too-long" };
  }

  const normalised = password.normalize("NFC");

  if (!normalised) {
    return { ok: false, refusal: "password-empty" };
  }

  if (FORBIDDEN.test(normalised)) {
    return { ok: false, refusal: "password-forbidden-characters" };
  }

  return { ok: true, password: normalised };
};

/**
 * Choosing a password is held to a minimum length; presenting one is not. The
 * rule is about what may be picked, and a password stored before it was raised
 * still has to open the door.
 */
export const normalisePassword = (password: string) => {
  const result = normalise(password);

  if (!result.ok) {
    throw new UnusablePassword(result.refusal);
  }

  if ([...result.password].length < MIN_PASSWORD_LENGTH) {
    throw new UnusablePassword("password-too-short");
  }

  return result.password;
};
