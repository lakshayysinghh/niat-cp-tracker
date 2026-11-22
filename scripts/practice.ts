/**
 * Daily practice sync (IMPLEMENTATION_PLAN.md, Phase 5). Run by .github/workflows/practice.yml
 * at 22:17 UTC (03:47 IST), or by hand:  npm run practice
 */
import "./load-env";
import { syncPractice } from "@/lib/sync/practice";

async function main() {
  const t0 = Date.now();
  const r = await syncPractice({ trigger: "CRON" });
  console.log(
    `practice: ${r.students} students · ${r.snapshots} rating snapshots · ${r.ratingHistories} rating histories · ` +
      `${r.fullHistory} full + ${r.incremental} incremental submission fetches · ${r.submissionsAdded} new submissions · ` +
      `${r.cfCalls} Codeforces calls · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  for (const e of r.errors) console.log(`  error ${e.handle}: ${e.error}`);
  // Per-student errors (a renamed handle) are logged, not fatal; a run where every student failed is.
  if (r.students > 0 && r.errors.length >= r.students) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Practice sync aborted:", err);
  process.exitCode = 1;
});
