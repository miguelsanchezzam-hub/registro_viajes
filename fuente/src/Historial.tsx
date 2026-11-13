import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { Icon } from "./icons";
import {
  TYPE_LABELS,
  TYPE_ORDER,
  addDays,
  fmtRange,
  mondayOf,
  money,
  parseDate,
  toDateStr,
  todayStr,
  type Trip,
  type TripType,
} from "./comun";

type Span = "semana" | "mes" | "anio";
const SPANS: { id: Span; label: string }[] = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
];
const UNIT: Record<Span, { cur: string; prev: string; bucket: string; bucketPl: string }> = {
  semana: { cur: "esta semana", prev: "la semana anterior", bucket: "día", bucketPl: "días" },
  mes: { cur: "este mes", prev: "el mes anterior", bucket: "día", bucketPl: "días" },
  anio: { cur: "este año", prev: "el año anterior", bucket: "mes", bucketPl: "meses" },
};

const monthFmt = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
const monthShort = new Intl.DateTimeFormat("es-MX", { month: "short" });
const dayLong = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY = ["L", "M", "M", "J", "V", "S", "D"];

interface Bucket {
  key: string;
  label: string;
  showLabel: boolean;
  title: string;
  from: string;
  to: string;
}
interface Period {
  from: string;
  to: string;
  title: string;
  buckets: Bucket[];
}

function firstOfMonth(s: string): Date {
  const d = parseDate(s);
  d.setDate(1);
  return d;
}

function periodFor(span: Span, anchor: string): Period {
  if (span === "semana") {
    const from = mondayOf(anchor);
    const to = addDays(from, 6);
    return {
      from,
      to,
      title: fmtRange(from, to),
      buckets: Array.from({ length: 7 }, (_, i) => {
        const day = addDays(from, i);
        return { key: day, label: WEEKDAY[i] ?? "", showLabel: true, title: cap(dayLong.format(parseDate(day))), from: day, to: day };
      }),
    };
  }
  if (span === "mes") {
    const first = firstOfMonth(anchor);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const n = last.getDate();
    return {
      from: toDateStr(first),
      to: toDateStr(last),
      title: cap(monthFmt.format(first)),
      buckets: Array.from({ length: n }, (_, i) => {
        const day = toDateStr(new Date(first.getFullYear(), first.getMonth(), i + 1));
        return { key: day, label: String(i + 1), showLabel: i === 0 || (i + 1) % 5 === 0, title: cap(dayLong.format(parseDate(day))), from: day, to: day };
      }),
    };
  }
  const y = parseDate(anchor).getFullYear();
  return {
    from: `${y}-01-01`,
    to: `${y}-12-31`,
    title: String(y),
    buckets: Array.from({ length: 12 }, (_, m) => {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      const name = cap(monthShort.format(first).replace(".", ""));
      return { key: toDateStr(first), label: name.charAt(0), showLabel: true, title: cap(monthFmt.format(first)), from: toDateStr(first), to: toDateStr(last) };
    }),
  };
}

function shiftAnchor(span: Span, anchor: string, dir: 1 | -1): string {
  if (span === "semana") return addDays(anchor, 7 * dir);
  const d = firstOfMonth(anchor);
  if (span === "mes") d.setMonth(d.getMonth() + dir);
  else {
    d.setMonth(0);
    d.setFullYear(d.getFullYear() + dir);
  }
  return toDateStr(d);
}

const inRange = (t: Trip, from: string, to: string) => t.date >= from && t.date <= to;
const sum = (ts: Trip[]) => ts.reduce((n, t) => n + t.amount_cents, 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* ───────────── Gráficas (SVG/CSS a mano, con las variables del tema) ───────────── */

interface Datum {
  key: string;
  label: string;
  showLabel: boolean;
  value: number;
  title: string;
  detail: string;
}

function BarChart({ data, ariaLabel }: { data: Datum[]; ariaLabel: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const chosen = data.find((d) => d.key === sel) ?? null;
  return (
    <div>
      <p className="bars-readout" role="status" aria-live="polite">
        {chosen ? (
          <>
            <b>{chosen.title}</b> · {chosen.detail}
          </>
        ) : (
          <span className="text-[var(--dim)]">Toca una barra para ver el detalle</span>
        )}
      </p>
      <div className="bars" role="group" aria-label={ariaLabel} data-dense={data.length > 14}>
        {data.map((d) => (
          <button
            key={d.key}
            type="button"
            className="bar-col"
            aria-pressed={sel === d.key}
            aria-label={`${d.title}: ${d.detail}`}
            onClick={() => setSel(sel === d.key ? null : d.key)}
          >
            <span className="bar-track">
              <span
                className="bar"
                data-zero={d.value === 0}
                style={{ height: d.value === 0 ? undefined : `${Math.max(4, (d.value / max) * 100)}%` }}
              />
            </span>
            <span className="bar-label" aria-hidden="true">
              {d.showLabel ? d.label : " "}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HBars({ rows }: { rows: { key: string; label: string; value: number; text: string; sub: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-semibold">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              <b>{r.text}</b> <span className="text-[var(--dim)]">· {r.sub}</span>
            </span>
          </div>
          <div className="hbar-track" aria-hidden="true">
            <div className="hbar" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "up" | "down" }) {
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value tabular-nums" data-tone={tone}>
        {value}
      </p>
      {hint && <p className="kpi-hint">{hint}</p>}
    </div>
  );
}

/* ───────────── Pantalla ───────────── */

export function Historial() {
  const [span, setSpan] = useState<Span>("semana");
  const [anchor, setAnchor] = useState(todayStr());

  const allQuery = useQuery({
    queryKey: ["trips", "historial"],
    queryFn: () => api.listTrips({ from: "2000-01-01", to: "2100-12-31" }),
  });
  const all = allQuery.data?.trips ?? [];

  const period = useMemo(() => periodFor(span, anchor), [span, anchor]);
  const prevPeriod = useMemo(() => periodFor(span, shiftAnchor(span, anchor, -1)), [span, anchor]);
  const isCurrent = useMemo(() => {
    const now = periodFor(span, todayStr());
    return now.from === period.from;
  }, [span, period]);

  const trips = useMemo(() => all.filter((t) => inRange(t, period.from, period.to)), [all, period]);
  const prevTrips = useMemo(() => all.filter((t) => inRange(t, prevPeriod.from, prevPeriod.to)), [all, prevPeriod]);

  const total = sum(trips);
  const prevTotal = sum(prevTrips);
  const u = UNIT[span];

  const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const deltaText =
    delta == null
      ? prevTrips.length === 0
        ? `Sin viajes ${u.prev}`
        : "—"
      : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))} % vs ${u.prev}`;

  const series: Datum[] = useMemo(
    () =>
      period.buckets.map((b) => {
        const ts = trips.filter((t) => inRange(t, b.from, b.to));
        const cents = sum(ts);
        return {
          key: b.key,
          label: b.label,
          showLabel: b.showLabel,
          value: cents,
          title: b.title,
          detail: ts.length === 0 ? "sin viajes" : `${money(cents)} · ${plural(ts.length, "viaje", "viajes")}`,
        };
      }),
    [period, trips],
  );
  const activeBuckets = series.filter((d) => d.value > 0);
  const best = activeBuckets.reduce<Datum | null>((m, d) => (m == null || d.value > m.value ? d : m), null);
  const avgTrip = trips.length > 0 ? total / trips.length : 0;
  const avgBucket = activeBuckets.length > 0 ? total / activeBuckets.length : 0;

  const byType = useMemo(() => {
    const m = new Map<TripType, { n: number; cents: number }>();
    for (const t of trips) {
      const e = m.get(t.type) ?? { n: 0, cents: 0 };
      e.n += 1;
      e.cents += t.amount_cents;
      m.set(t.type, e);
    }
    return TYPE_ORDER.filter((t) => m.has(t))
      .map((t) => ({ type: t, ...(m.get(t) as { n: number; cents: number }) }))
      .sort((a, b) => b.n - a.n || b.cents - a.cents);
  }, [trips]);

  const byPerson = useMemo(() => {
    const m = new Map<string, { n: number; cents: number }>();
    for (const t of trips) {
      const names = new Set(t.people.map((p) => p.name));
      for (const name of names) {
        const e = m.get(name) ?? { n: 0, cents: 0 };
        e.n += 1;
        e.cents += t.amount_cents;
        m.set(name, e);
      }
    }
    return [...m.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.n - a.n || b.cents - a.cents);
  }, [trips]);

  const byHour = useMemo(() => {
    const counts = new Array<number>(24).fill(0);
    let any = false;
    for (const t of trips) {
      for (const x of [t.arrive_time, t.depart_time]) {
        if (!x) continue;
        const h = Number(x.split(":")[0]);
        if (Number.isFinite(h) && h >= 0 && h < 24) {
          counts[h] = (counts[h] ?? 0) + 1;
          any = true;
        }
      }
    }
    if (!any) return [] as Datum[];
    const used = counts.map((c, h) => (c > 0 ? h : -1)).filter((h) => h >= 0);
    const lo = Math.max(0, Math.min(...used) - 1);
    const hi = Math.min(23, Math.max(...used) + 1);
    const out: Datum[] = [];
    for (let h = lo; h <= hi; h++) {
      const c = counts[h] ?? 0;
      out.push({
        key: String(h),
        label: String(h),
        showLabel: (h - lo) % 2 === 0,
        value: c,
        title: `${String(h).padStart(2, "0")}:00 – ${String(h).padStart(2, "0")}:59`,
        detail: c === 0 ? "sin registros" : plural(c, "registro", "registros"),
      });
    }
    return out;
  }, [trips]);
  const peakHour = byHour.reduce<Datum | null>((m, d) => (m == null || d.value > m.value ? d : m), null);

  const topType = byType[0];
  const topPerson = byPerson[0];

  return (
    <div>
      <div className="seg mt-4" role="group" aria-label="Periodo">
        {SPANS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={span === s.id}
            onClick={() => {
              setSpan(s.id);
              setAnchor(todayStr());
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <section className="hero mt-4 px-5 pb-6 pt-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Periodo anterior" onClick={() => setAnchor(shiftAnchor(span, anchor, -1))} className="hero-btn">
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="text-center">
            <p className="hero-dim text-sm">{isCurrent ? cap(u.cur) : span === "semana" ? "Semana" : span === "mes" ? "Mes" : "Año"}</p>
            <p className="text-base font-semibold" data-testid="hist-title">{period.title}</p>
          </div>
          <button type="button" aria-label="Periodo siguiente" onClick={() => setAnchor(shiftAnchor(span, anchor, 1))} className="hero-btn">
            <Icon name="chevron-right" size={20} />
          </button>
        </div>
        {!isCurrent && (
          <div className="mt-2 text-center">
            <button type="button" className="hero-chip" onClick={() => setAnchor(todayStr())}>
              Volver a {u.cur}
            </button>
          </div>
        )}
        <div className="mt-5 text-center">
          <p className="hero-dim text-sm">Total recibido</p>
          <p className="text-5xl font-extrabold tabular-nums tracking-tight" data-testid="hist-total">
            {allQuery.isPending ? "…" : money(total)}
          </p>
          <p className="hero-dim mt-1 text-sm">{plural(trips.length, "viaje", "viajes")}</p>
          <p className="mt-3">
            <span className="hero-chip font-semibold" data-testid="hist-delta">{deltaText}</span>
          </p>
        </div>
      </section>

      {trips.length === 0 ? (
        <div className="card mt-5 p-5 text-center text-sm text-[var(--dim)]">
          {allQuery.isPending ? "Cargando…" : "No hay viajes registrados en este periodo."}
        </div>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="section-title">Indicadores</h2>
            <div className="kpi-grid mt-2">
              <Kpi label="Viajes" value={String(trips.length)} hint={`${money(total)} en total`} />
              <Kpi label="Promedio por viaje" value={money(avgTrip)} />
              <Kpi
                label={`Promedio por ${u.bucket} con viajes`}
                value={money(avgBucket)}
                hint={`${activeBuckets.length} ${activeBuckets.length === 1 ? u.bucket : u.bucketPl} con viajes`}
              />
              <Kpi label={`Mejor ${u.bucket}`} value={best ? money(best.value) : "—"} hint={best?.title} />
              <Kpi
                label={`Contra ${u.prev}`}
                value={delta == null ? "—" : `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta))} %`}
                hint={prevTotal > 0 ? `Antes: ${money(prevTotal)}` : "Sin datos para comparar"}
                tone={delta == null ? undefined : delta >= 0 ? "up" : "down"}
              />
              <Kpi
                label="Tipo más frecuente"
                value={topType ? TYPE_LABELS[topType.type] : "—"}
                hint={topType ? plural(topType.n, "viaje", "viajes") : undefined}
              />
              <Kpi
                label="Persona con más viajes"
                value={topPerson ? topPerson.name : "—"}
                hint={topPerson ? plural(topPerson.n, "viaje", "viajes") : undefined}
              />
              <Kpi label="Hora más movida" value={peakHour && peakHour.value > 0 ? `${peakHour.label.padStart(2, "0")}:00` : "—"} hint={peakHour && peakHour.value > 0 ? peakHour.detail : "Sin horas registradas"} />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="section-title">{span === "anio" ? "Recibido por mes" : "Recibido por día"}</h2>
            <div className="card mt-2 p-4">
              <BarChart key={`${span}-${period.from}`} data={series} ariaLabel={span === "anio" ? "Total por mes" : "Total por día"} />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="section-title">Por tipo de viaje</h2>
            <div className="card mt-2 p-4">
              <HBars
                rows={byType.map((b) => ({
                  key: b.type,
                  label: TYPE_LABELS[b.type],
                  value: b.n,
                  text: plural(b.n, "viaje", "viajes"),
                  sub: money(b.cents),
                }))}
              />
            </div>
          </section>

          {byPerson.length > 0 && (
            <section className="mt-6">
              <h2 className="section-title">Por persona</h2>
              <div className="card mt-2 p-4">
                <HBars
                  rows={byPerson.map((p) => ({
                    key: p.name,
                    label: p.name,
                    value: p.n,
                    text: plural(p.n, "viaje", "viajes"),
                    sub: money(p.cents),
                  }))}
                />
                <p className="mt-3 text-xs text-[var(--dim)]">
                  El monto es el de los viajes en que participó cada persona; un viaje con varias personas cuenta para cada una.
                </p>
              </div>
            </section>
          )}

          {byHour.length > 0 && (
            <section className="mt-6">
              <h2 className="section-title">Horas de llegada y salida de planta</h2>
              <div className="card mt-2 p-4">
                <BarChart key={`h-${span}-${period.from}`} data={byHour} ariaLabel="Registros por hora del día" />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
