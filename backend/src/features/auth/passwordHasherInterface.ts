export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasherInterface {
  verify(passwordHash: string, password: string): Promise<boolean>;
  hash(password: string): Promise<string>;
}
