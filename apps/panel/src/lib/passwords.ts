import { hash, verify } from "@node-rs/argon2";

// argon2id with the library defaults (OWASP-compliant parameters).
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(input.hash, input.password);
  } catch {
    return false;
  }
}
