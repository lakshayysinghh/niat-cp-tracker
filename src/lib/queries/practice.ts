import "server-only";
import { asc, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { practiceSyncState, ratingSnapshots, students } from "@/db/schema";
import { getDefaultBatchId } from "@/lib/sync/runs";

/**
 * Practice reads (Section 8 "Practice"). A problem counts as solved once, at its FIRST
 * accepted submission; a problem is (contest or name) + index, so gym/mashup copies and
 * problemset problems are kept apart.
 */

const PROBLEM_KEY = sql`coalesce(cf_contest_id::text, problem_name) || '/' || problem_index`;

export interface PracticeRow {
  id: string;
  niatId: string;
  name: string | null;
  cfHandle: string;
  handleStatus: "UNVERIFIED" | "VALID" | "INVALID";
  rating: number | null;
  rating30dAgo: number | null;
  solved7: number;
  solved28: number;
  avgRating28: number | null;
  solvedTotal: number;
  lastAcAt: Date | null;
  /** whole days since the last accepted submission; null = never */
  daysSinceAc: number | null;
}

function rowsOf<T>(r: unknown): T[] {
  return ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
}

export async function getPracticeTable() {
  const batchId = await getDefaultBatchId();
  const [roster, solvedRes, ratingRes, [sync]] = await Promise.all([
    db
      .select({ id: students.id, niatId: students.niatId, name: students.name, cfHandle: students.cfHandle, handleStatus: students.handleStatus, rating: students.cfRating })
      .from(students)
      .where(eq(students.batchId, batchId))
      .orderBy(asc(students.niatId)),
    db.execute(sql`
      with first_ac as (
        select student_id, ${PROBLEM_KEY} as k, min(submitted_at) as first_at, max(problem_rating) as rating
        from submissions where verdict = 'OK'
        group by student_id, k
      )
      select student_id,
        count(*) filter (where first_at >= now() - interval '7 days')::int  as solved7,
        count(*) filter (where first_at >= now() - interval '28 days')::int as solved28,
        round(avg(rating) filter (where first_at >= now() - interval '28 days'))::int as avg28,
        count(*)::int as total,
        max(first_at) as last_new,
        (select max(submitted_at) from submissions s2 where s2.student_id = first_ac.student_id and s2.verdict = 'OK') as last_ac
      from first_ac group by student_id`),
    db.execute(sql`
      select distinct on (student_id) student_id, rating
      from rating_snapshots
      where taken_on <= (now() at time zone 'Asia/Kolkata')::date - 30
      order by student_id, taken_on desc`),
    db.select({ at: max(practiceSyncState.lastSyncedAt) }).from(practiceSyncState),
  ]);

  type Solved = { student_id: string; solved7: number; solved28: number; avg28: number | null; total: number; last_ac: string | Date | null };
  const solved = new Map(rowsOf<Solved>(solvedRes).map((r) => [r.student_id, r]));
  const old = new Map(rowsOf<{ student_id: string; rating: number | null }>(ratingRes).map((r) => [r.student_id, r.rating]));

  const now = Date.now();
  const rows: PracticeRow[] = roster.map((s) => {
    const x = solved.get(s.id);
    const lastAc = x?.last_ac ? new Date(x.last_ac) : null;
    return {
      id: s.id,
      niatId: s.niatId,
      name: s.name,
      cfHandle: s.cfHandle,
      handleStatus: s.handleStatus,
      rating: s.rating,
      rating30dAgo: old.get(s.id) ?? null,
      solved7: x?.solved7 ?? 0,
      solved28: x?.solved28 ?? 0,
      avgRating28: x?.avg28 ?? null,
      solvedTotal: x?.total ?? 0,
      lastAcAt: lastAc,
      daysSinceAc: lastAc ? Math.floor((now - lastAc.getTime()) / 86400000) : null,
    };
  });
  return { rows, lastSyncedAt: sync?.at ?? null };
}

// ---------------------------------------------------------------- one student

export async function getStudentPractice(studentId: string) {
  const [ratingRows, weeklyRes, diffRes, tagRes] = await Promise.all([
    db
      .select({ takenOn: ratingSnapshots.takenOn, rating: ratingSnapshots.rating })
      .from(ratingSnapshots)
      .where(eq(ratingSnapshots.studentId, studentId))
      .orderBy(asc(ratingSnapshots.takenOn)),
    db.execute(sql`
      with first_ac as (
        select ${PROBLEM_KEY} as k, min(submitted_at) as first_at
        from submissions where student_id = ${studentId} and verdict = 'OK' group by k
      )
      select to_char(date_trunc('week', first_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD') as week, count(*)::int as n
      from first_ac
      where first_at >= now() - interval '12 weeks'
      group by 1 order by 1`),
    db.execute(sql`
      with first_ac as (
        select ${PROBLEM_KEY} as k, max(problem_rating) as rating
        from submissions where student_id = ${studentId} and verdict = 'OK' group by k
      )
      select rating, count(*)::int as n from first_ac where rating is not null group by rating order by rating`),
    db.execute(sql`
      with first_ac as (
        select distinct on (k) k, tags
        from (select ${PROBLEM_KEY} as k, tags, submitted_at from submissions where student_id = ${studentId} and verdict = 'OK') x
        order by k, submitted_at
      )
      select t as tag, count(*)::int as n from first_ac cross join lateral unnest(first_ac.tags) as t group by t order by n desc, t limit 12`),
  ]);

  // 12 IST weeks (Monday start), oldest first, zero-filled.
  const weekly = new Map(rowsOf<{ week: string; n: number }>(weeklyRes).map((r) => [r.week, r.n]));
  const mondayIst = (() => {
    const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()) + "T00:00:00Z");
    const dow = (today.getUTCDay() + 6) % 7;
    return new Date(today.getTime() - dow * 86400000);
  })();
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(mondayIst.getTime() - (11 - i) * 7 * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { week: key, solved: weekly.get(key) ?? 0 };
  });

  // Difficulty histogram 800..3500 in steps of 100 (zero-filled).
  const byRating = new Map(rowsOf<{ rating: number; n: number }>(diffRes).map((r) => [r.rating, r.n]));
  const difficulty = Array.from({ length: 28 }, (_, i) => 800 + i * 100).map((r) => ({ rating: r, solved: byRating.get(r) ?? 0 }));

  return {
    rating: ratingRows.filter((r) => r.rating != null).map((r) => ({ date: r.takenOn, rating: r.rating as number })),
    weeks,
    difficulty,
    tags: rowsOf<{ tag: string; n: number }>(tagRes).map((r) => ({ tag: r.tag, solved: r.n })),
  };
}

export type StudentPractice = Awaited<ReturnType<typeof getStudentPractice>>;
