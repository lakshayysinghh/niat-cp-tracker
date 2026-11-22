/**
 * Remove the test roster (tests/fixtures/roster-734032-test.csv) before importing real students.
 * Matches ONLY NIAT IDs of the exact form TEST + 3 digits (TEST001…TEST999).
 * Their problem cells and participations are removed by ON DELETE CASCADE; contests stay
 * (refresh them after the real import).
 *
 *   npm run test-data:delete            # list what would be deleted (no changes)
 *   npm run test-data:delete -- --yes   # delete, then verify none remain
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });

const PATTERN = "^TEST[0-9]{3}$";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (.env.local)");
  const sql = neon(url);
  const confirm = process.argv.includes("--yes");

  const rows = await sql`select niat_id, cf_handle, name from students where niat_id ~ ${PATTERN} order by niat_id`;
  if (rows.length === 0) {
    console.log("No test students found (NIAT IDs TEST001–TEST999). Nothing to do.");
    return;
  }
  console.log(`${rows.length} test student(s):`);
  for (const r of rows) console.log(`  ${r.niat_id}  ${String(r.cf_handle).padEnd(24)} ${r.name ?? ""}`);

  if (!confirm) {
    console.log("\nDry run: nothing deleted. Re-run with --yes to delete them.");
    return;
  }

  const deleted = await sql`delete from students where niat_id ~ ${PATTERN} returning niat_id`;
  const [{ n }] = await sql`select count(*)::int as n from students where niat_id ~ ${PATTERN}`;
  console.log(`\nDeleted ${deleted.length} test student(s). Remaining test students: ${n}.`);
  if (n !== 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
