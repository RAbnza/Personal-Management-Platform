import { Client } from "pg";
import { mkdir, open, readFile, unlink, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  FileBoundaryError,
  FILE_LIMIT_BYTES,
  sha256,
} from "@/modules/files/domain/supporting-file";
import type { PrivateEvidenceStore } from "./object-store";
import type { MalwareScanner } from "./malware-scanner";
/** Controlled synthetic-database adapter only. It is never a production scan
 * substitute. Every operation verifies the actual database, not just its URL. */
async function guard() {
  const raw = process.env.FILES_DATABASE_URL || process.env.DATABASE_URL;
  if (process.env.PMP_DEPLOYMENT_ENV !== "local" || !raw)
    throw new FileBoundaryError("FILE_TEST_ADAPTER_FORBIDDEN");
  const url = new URL(raw);
  if (
    url.pathname !== "/personal_management_test" ||
    !["app_domain", "worker_domain"].includes(url.username)
  )
    throw new FileBoundaryError("FILE_TEST_ADAPTER_FORBIDDEN");
  const c = new Client({
    connectionString: raw,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  });
  try {
    await c.connect();
    if (
      (await c.query("SELECT current_database() name")).rows[0]?.name !==
      "personal_management_test"
    )
      throw new FileBoundaryError("FILE_TEST_ADAPTER_FORBIDDEN");
  } finally {
    await c.end();
  }
}
function directory() {
  const expected = resolve(process.cwd(), "out", "pmp-files-test-runtime");
  if (resolve(process.env.FILES_TEST_ADAPTER_DIR ?? "") !== expected)
    throw new FileBoundaryError("FILE_TEST_ADAPTER_FORBIDDEN");
  return expected;
}
function path(key: string) {
  const parts = key.split("/");
  if (
    parts.length !== 3 ||
    parts[0] !== "evidence" ||
    !z.uuid().safeParse(parts[1]).success ||
    !z.uuid().safeParse(parts[2]).success
  )
    throw new FileBoundaryError("FILE_OBJECT_KEY_INVALID");
  return join(directory(), `${parts[1]}-${parts[2]}`);
}
export function localTestEvidenceStore(): PrivateEvidenceStore {
  directory();
  return {
    namespace: "synthetic-local-files-v1",
    async putOnce(key, body) {
      await guard();
      if (body.length < 1 || body.length > FILE_LIMIT_BYTES)
        throw new FileBoundaryError("FILE_TOO_LARGE");
      await mkdir(directory(), { recursive: true, mode: 0o700 });
      const f = await open(path(key), "wx", 0o600);
      try {
        await f.writeFile(body);
      } finally {
        await f.close();
      }
    },
    async read(key) {
      await guard();
      const p = path(key),
        s = await stat(p);
      if (!s.isFile() || s.size < 1 || s.size > FILE_LIMIT_BYTES)
        throw new FileBoundaryError("FILE_SIZE_INVALID");
      return readFile(p);
    },
    async delete(key) {
      await guard();
      try {
        await unlink(path(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    },
  };
}
export function localTestScanner(): MalwareScanner {
  directory();
  return {
    async scan(body) {
      await guard();
      return {
        engineVersion: "ClamAV 0.0.0",
        signaturesUpdatedAt: new Date().toISOString(),
        checksumSha256: sha256(body),
        result: body.includes("PMP_SYNTHETIC_INFECTED") ? "infected" : "passed",
      };
    },
  };
}
