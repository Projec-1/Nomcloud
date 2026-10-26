export interface SupabaseBackupInventory {
  status: "records_found" | "none_found";
  backupCount: number;
  latestBackupAt: string | null;
  latestBackupStatus: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

function backupRows(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const object = asRecord(payload);
  if (!object) return null;
  if (Array.isArray(object.backups)) return object.backups;
  if (Array.isArray(object.data)) return object.data;
  return null;
}

function getBackupTime(backup: Record<string, unknown>): number | null {
  for (const field of ["inserted_at", "created_at", "backup_at", "started_at"]) {
    const value = backup[field];
    if (typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseSupabaseBackupInventory(
  payload: unknown,
): SupabaseBackupInventory | null {
  const rows = backupRows(payload);
  if (!rows || rows.some((row) => {
    const backup = asRecord(row);
    return !backup || ![
      "id",
      "name",
      "status",
      "inserted_at",
      "created_at",
      "backup_at",
      "started_at",
    ].some((field) => field in backup);
  })) return null;
  if (rows.length === 0) {
    return {
      status: "none_found",
      backupCount: 0,
      latestBackupAt: null,
      latestBackupStatus: null,
    };
  }

  let latest: Record<string, unknown> | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const backup = asRecord(row);
    if (!backup) return null;
    const time = getBackupTime(backup);
    if (time !== null && time > latestTime) {
      latest = backup;
      latestTime = time;
    }
  }

  const status = latest?.status;
  const latestBackupStatus = typeof status === "string" &&
      /^[A-Za-z0-9 _-]{1,40}$/.test(status.trim())
    ? status.trim()
    : null;

  return {
    status: "records_found",
    backupCount: rows.length,
    latestBackupAt: latest && Number.isFinite(latestTime)
      ? new Date(latestTime).toISOString()
      : null,
    latestBackupStatus,
  };
}
