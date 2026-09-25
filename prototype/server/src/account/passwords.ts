// Password hashing with Argon2id (NFR-SEC-02). Salts are generated per hash by the library.
import { hash, verify } from '@node-rs/argon2';

export const ARGON2_PARAMS = { algorithm: 2 /* Algorithm.Argon2id (const enum) */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
export const ARGON2_PARAMS_LABEL = 'm=19456,t=2,p=1';

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Constant-work dummy verification so unknown emails take similar time to known ones. */
let dummyHash: Promise<string> | null = null;
export async function dummyVerify(password: string) {
  dummyHash ??= hashPassword('famplan-dummy-password-1');
  await verifyPassword(await dummyHash, password);
}
