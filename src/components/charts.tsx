"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small single-series SVG charts (dataviz skill specs): one validated mark hue
 * (#02a671 passes the dark-surface band/contrast checks), 2px lines, columns <= 24px
 * with 4px rounded data-ends and a square baseline, 2px surface gaps, hairline grid,
 * selective labels, a hover/focus tooltip on every chart, and a table view.
 */

const MARK = "#02a671";
const GRID = "rgba(255,255,255,0.07)";
const SURFACE = "var(--background)";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** ~4 clean ticks covering [min, max]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min = min - 1;
    max = max + 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-IN");

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left, top: Math.max(y - 10, 18) }}
    >
      {children}
    </div>
  );
}

export function TableView({ caption, head, rows }: { caption: string; head: [string, string]; rows: Array<[string, string | number]> }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">Show table</summary>
      <div className="scrollbar-thin mt-2 max-h-48 overflow-auto rounded-md border border-border">
        <table className="w-full">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-popover">
            <tr>
              <th className="px-2 py-1 text-left font-medium">{head[0]}</th>
              <th className="px-2 py-1 text-right font-medium">{head[1]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(([a, b]) => (
              <tr key={a}>
                <td className="px-2 py-1">{a}</td>
                <td className="px-2 py-1 text-right tabular-nums text-foreground">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- rating line (step-after)

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(iso + "T00:00:00Z"));

export function RatingChart({ points, height = 220 }: { points: Array<{ date: string; rating: number }>; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 52, t: 14, b: 26 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;

  if (points.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No rated contests yet.</p>;

  const t0 = new Date(points[0].date).getTime();
  const t1 = Math.max(new Date(points[points.length - 1].date).getTime(), t0 + 86400000);
  const ticks = niceTicks(Math.min(...points.map((p) => p.rating)), Math.max(...points.map((p) => p.rating)));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x = (d: string) => pad.l + ((new Date(d).getTime() - t0) / (t1 - t0)) * w;
  const y = (v: number) => pad.t + h - ((v - yMin) / (yMax - yMin)) * h;

  // Step-after: a rating holds until the next change.
  let path = `M${x(points[0].date)},${y(points[0].rating)}`;
  for (let i = 1; i < points.length; i++) path += `H${x(points[i].date)}V${y(points[i].rating)}`;
  const area = `${path}V${pad.t + h}H${x(points[0].date)}Z`;
  const last = points[points.length - 1];
  const xTicks = [0, 0.5, 1].map((f) => new Date(t0 + f * (t1 - t0)).toISOString().slice(0, 10));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 0; i < points.length; i++) if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    setHover(best);
  }

  const hp = hover != null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Rating history, ${points.length} points, latest ${last.rating}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          tabIndex={0}
          onFocus={() => setHover(points.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((i) => Math.max(0, (i ?? points.length) - 1));
            if (e.key === "ArrowRight") setHover((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          }}
          className="outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xTicks.map((d, i) => (
            <text key={d + i} x={x(d)} y={height - 8} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
              {fmtDate(d)}
            </text>
          ))}
          <path d={area} fill={MARK} fillOpacity={0.1} />
          <path d={path} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(last.date)} cy={y(last.rating)} r={4} fill={MARK} stroke={SURFACE} strokeWidth={2} />
          <text x={x(last.date) + 8} y={y(last.rating)} dy="0.32em" className="fill-foreground text-[11px] font-medium tabular-nums">
            {fmt(last.rating)}
          </text>
          {hp && (
            <g>
              <line x1={x(hp.date)} x2={x(hp.date)} y1={pad.t} y2={pad.t + h} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
              <circle cx={x(hp.date)} cy={y(hp.rating)} r={4} fill={MARK} stroke={SURFACE} strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <Tooltip x={x(hp.date)} y={y(hp.rating)} width={width}>
          <div className="font-semibold tabular-nums text-foreground">{fmt(hp.rating)}</div>
          <div className="text-muted-foreground">{fmtDate(hp.date)}</div>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- columns

export function ColumnChart({
  data,
  height = 200,
  valueLabel,
  labelEvery = 1,
  ariaLabel,
}: {
  data: Array<{ key: string; label: string; value: number; title: string }>;
  height?: number;
  valueLabel: string;
  labelEvery?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 32, r: 8, t: 18, b: 24 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const ticks = niceTicks(0, Math.max(1, ...data.map((d) => d.value)), 3);
  const yMax = ticks[ticks.length - 1];
  const band = data.length ? w / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2)); // capped at 24px; >= 2px gap between neighbours
  const y = (v: number) => pad.t + h - (v / yMax) * h;
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);

  /** Column with a 4px rounded top (data end) and a square baseline. */
  const col = (cx: number, v: number) => {
    const top = y(v);
    const base = pad.t + h;
    const r = Math.min(4, (base - top) / 2, barW / 2);
    const l = cx - barW / 2;
    const rt = cx + barW / 2;
    return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${rt - r}Q${rt},${top} ${rt},${top + r}V${base}Z`;
  };

  const hd = hover != null ? data[hover] : null;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            return (
              <g key={d.key}>
                {d.value > 0 && <path d={col(cx, d.value)} fill={MARK} opacity={hover == null || hover === i ? 1 : 0.55} />}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                    {d.label}
                  </text>
                )}
                {/* Selective label: the tallest column only. */}
                {i === maxIdx && d.value > 0 && (
                  <text x={cx} y={y(d.value) - 5} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                    {d.value}
                  </text>
                )}
                {/* Hit target: the whole band, taller than the mark. */}
                <rect
                  x={pad.l + band * i}
                  y={pad.t}
                  width={band}
                  height={h}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.title}: ${d.value} ${valueLabel}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
      )}
      {hd && hover != null && (
        <Tooltip x={pad.l + band * hover + band / 2} y={y(hd.value)} width={width}>
          <div className="font-semibold tabular-nums text-foreground">
            {hd.value} {valueLabel}
          </div>
          <div className="text-muted-foreground">{hd.title}</div>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- horizontal bars (tags)

export function BarList({ data, valueLabel }: { data: Array<{ label: string; value: number }>; valueLabel: string }) {
  const maxV = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No solved problems yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs" title={`${d.label}: ${d.value} ${valueLabel}`}>
          <span className="truncate text-muted-foreground">{d.label}</span>
          <span className="flex items-center gap-2">
            {/* Square at the baseline, 4px rounded data-end. */}
            <span className="h-3 min-w-0 flex-1" aria-hidden>
              <span className="block h-full rounded-r-[4px]" style={{ width: `${(d.value / maxV) * 100}%`, background: MARK }} />
            </span>
            <span className="w-7 shrink-0 text-right tabular-nums text-foreground">{d.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
