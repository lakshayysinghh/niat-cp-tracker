"use client";

import { BarList, ColumnChart, RatingChart, TableView } from "@/components/charts";
import { Panel } from "@/components/ui-kit";
import type { StudentPractice } from "@/lib/queries/practice";

const weekFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const wk = (iso: string) => weekFmt.format(new Date(iso + "T00:00:00Z"));

export function PracticeCharts({ data }: { data: StudentPractice }) {
  const solvedTotal = data.difficulty.reduce((a, d) => a + d.solved, 0);
  // Trim the histogram to the populated range (keeps 800 as the floor).
  const lastRated = data.difficulty.reduce((m, d, i) => (d.solved > 0 ? i : m), 4);
  const diff = data.difficulty.slice(0, Math.min(data.difficulty.length, lastRated + 3));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Rating" description="Official Codeforces rating; each step is a rated round.">
        <div className="p-4">
          <RatingChart points={data.rating} />
          <TableView caption="Rating history" head={["Date", "Rating"]} rows={[...data.rating].reverse().map((p) => [p.date, p.rating])} />
        </div>
      </Panel>

      <Panel title="New problems solved per week" description="Last 12 weeks, Monday to Sunday (IST); first accepted submission only.">
        <div className="p-4">
          <ColumnChart
            ariaLabel="New problems solved per week, last 12 weeks"
            valueLabel="solved"
            labelEvery={2}
            data={data.weeks.map((w) => ({ key: w.week, label: wk(w.week), value: w.solved, title: `Week of ${wk(w.week)}` }))}
          />
          <TableView caption="Weekly solves" head={["Week of", "Solved"]} rows={[...data.weeks].reverse().map((w) => [wk(w.week), w.solved])} />
        </div>
      </Panel>

      <Panel title="Difficulty of solved problems" description={`${solvedTotal} rated problems solved, all time.`}>
        <div className="p-4">
          {solvedTotal === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No rated problems solved yet.</p>
          ) : (
            <ColumnChart
              ariaLabel="Solved problems by difficulty rating"
              valueLabel="problems"
              labelEvery={diff.length > 14 ? 4 : 2}
              data={diff.map((d) => ({ key: String(d.rating), label: String(d.rating), value: d.solved, title: `Rated ${d.rating}` }))}
            />
          )}
          <TableView caption="Solved problems by rating" head={["Rating", "Solved"]} rows={diff.filter((d) => d.solved > 0).map((d) => [String(d.rating), d.solved])} />
        </div>
      </Panel>

      <Panel title="Solved problems by tag" description="Top 12 tags; a problem with several tags counts under each.">
        <div className="p-4">
          <BarList valueLabel="problems" data={data.tags.map((t) => ({ label: t.tag, value: t.solved }))} />
        </div>
      </Panel>
    </div>
  );
}
