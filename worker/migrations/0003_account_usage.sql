-- Per-account object-count quota (worker/src/usage.ts).
--
-- Bounds R2 storage abuse: an authenticated account could otherwise upload
-- unlimited blobs. Combined with the 25 MB/blob cap (MAX_BLOB_BYTES), the worst
-- case is object_count * 25 MB. The counter is maintained on blob PUT/DELETE;
-- drift from a failed counter write is under-count-biased (lenient — never locks
-- out a legitimate user), so no reconciliation job is required.
CREATE TABLE IF NOT EXISTS account_usage (
  account_id   TEXT PRIMARY KEY,
  object_count INTEGER NOT NULL DEFAULT 0
);
