import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const encoded = process.env.EMAIL_PAYLOAD_KEY;
  if (!encoded || !/^[a-f0-9]{64}$/i.test(encoded))
    throw new Error("Security email encryption is not configured.");
  return Buffer.from(encoded, "hex");
}
export function encryptEmailSecret(
  plaintext: string,
  associatedId: string,
): Buffer {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(associatedId));
  return Buffer.concat([
    iv,
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}
export function decryptEmailSecret(
  encrypted: Buffer,
  associatedId: string,
): string {
  if (encrypted.length < 28)
    throw new Error("Security email payload is invalid.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    encrypted.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(associatedId));
  decipher.setAuthTag(encrypted.subarray(-16));
  return Buffer.concat([
    decipher.update(encrypted.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8");
}
