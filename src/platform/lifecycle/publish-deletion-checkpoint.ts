import { z } from "zod";
import {
  createBackupObjectStore,
  type BackupObjectStore,
} from "@/platform/backup/object-store";
export const deletionCheckpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.uuid(),
    targetUserId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    requestedAt: z.iso.datetime(),
    purgeAfter: z.iso.datetime(),
  })
  .strict();
export async function publishDeletionCheckpoint(
  input: z.infer<typeof deletionCheckpointSchema>,
  store: BackupObjectStore = createBackupObjectStore(),
) {
  const record = deletionCheckpointSchema.parse(input);
  const key = `v1-deletion-register/${record.requestId}.json`;
  const bytes = Buffer.from(JSON.stringify(record));
  await store.putOnce(key, bytes);
  if (!(await store.read(key)).equals(bytes))
    throw new Error("Independent checkpoint verification failed.");
}
