export type PasswordRefusal =
  | "password-empty"
  | "password-too-long"
  | "password-forbidden-characters";

export class UnusablePassword extends Error {
  constructor(readonly refusal: PasswordRefusal) {
    super(refusal);
    this.name = "UnusablePassword";
  }
}

export class UnreadableHash extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableHash";
  }
}
