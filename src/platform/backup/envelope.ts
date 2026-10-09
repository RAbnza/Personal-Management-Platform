import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const magic = Buffer.from("PMPBACKUP1\n");
const metadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    backupId: z.uuid(),
    keyId: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
  })
  .strict();
function key(encoded: string) {
  if (!/^[a-f0-9]{64}$/i.test(encoded))
    throw new Error("Backup encryption key is invalid.");
  return Buffer.from(encoded, "hex");
}
/** Authenticated, versioned envelope. The independent recovery key is never
 * stored with the dump. Header identity is authenticated as associated data. */
export function encryptBackup(
  dump: Buffer,
  metadata: z.infer<typeof metadataSchema>,
  encodedKey: string,
) {
  const header = Buffer.from(JSON.stringify(metadataSchema.parse(metadata)));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(encodedKey), iv);
  cipher.setAAD(header);
  return Buffer.concat([
    magic,
    length,
    header,
    iv,
    cipher.update(dump),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}
export function decryptBackup(
  envelope: Buffer,
  encodedKey: string,
  expectedKeyId: string,
) {
  if (
    envelope.length < magic.length + 4 + 28 ||
    !envelope.subarray(0, magic.length).equals(magic)
  )
    throw new Error("Backup envelope is invalid.");
  const length = envelope.readUInt32BE(magic.length),
    start = magic.length + 4,
    end = start + length;
  if (length > 1024 || envelope.length < end + 28)
    throw new Error("Backup header is invalid.");
  const header = envelope.subarray(start, end),
    metadata = metadataSchema.parse(JSON.parse(header.toString()));
  if (metadata.keyId !== expectedKeyId)
    throw new Error("Backup recovery key ID does not match.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(encodedKey),
    envelope.subarray(end, end + 12),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(envelope.subarray(-16));
  return {
    metadata,
    dump: Buffer.concat([
      decipher.update(envelope.subarray(end + 12, -16)),
      decipher.final(),
    ]),
  };
}
