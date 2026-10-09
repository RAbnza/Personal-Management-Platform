import { describe, expect, it } from "vitest";
import { encryptBackup, decryptBackup } from "@/platform/backup/envelope";
describe("recoverable authenticated logical backup", () => {
  const metadata = {
      schemaVersion: 1 as const,
      backupId: "bbd127d3-11a0-4d67-8c5b-cadf7d4c1b6b",
      keyId: "backup-v1",
    },
    key = "ab".repeat(32),
    dump = Buffer.from("PGDMP\u0000sensitive synthetic evidence");
  it("reproduces exact dump bytes and authenticates identity without plaintext storage", () => {
    const encrypted = encryptBackup(dump, metadata, key);
    expect(encrypted.includes(dump)).toBe(false);
    expect(decryptBackup(encrypted, key, metadata.keyId)).toEqual({
      metadata,
      dump,
    });
    expect(() =>
      decryptBackup(encrypted, "bc".repeat(32), metadata.keyId),
    ).toThrow();
    expect(() => decryptBackup(encrypted, key, "different-key")).toThrow();
    const changed = Buffer.from(encrypted);
    changed[changed.length - 18] = changed[changed.length - 18]! ^ 1;
    expect(() => decryptBackup(changed, key, metadata.keyId)).toThrow();
  });
  it("rejects truncated or misleading envelopes before attempting restoration", () => {
    expect(() => decryptBackup(Buffer.alloc(5), key, metadata.keyId)).toThrow();
    expect(() =>
      encryptBackup(dump, { ...metadata, keyId: "invalid key" }, key),
    ).toThrow();
  });
});
