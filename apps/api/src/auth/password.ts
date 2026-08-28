import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Password hashing via bcryptjs (pure JS, no native binary to compile/fetch — consistent
 * with this project's caution around native/CDN-fetched dependencies after the Prisma
 * incident, docs/DECISIONS.md D2).
 */
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
