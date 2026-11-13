import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./sdk";
import { api, type ApiResponse } from "./api";
import { Icon } from "./icons";

type Trip = ApiResponse<typeof api, "listTrips">["trips"][number];
type TripType = Trip["type"];
type Direction = Trip["people"][number]["direction"];

const TYPE_LABELS: Record<TripType, string> = {
  redondo: "Redondo",
  simple: "Simple",
  doble: "Doble",
  triple: "Triple",
  aeropuerto: "Aeropuerto",
  sucursal: "Sucursal",
  especial: "Especial",
};

const TYPE_ORDER: TripType[] = [
  "redondo",
  "simple",
  "doble",
  "triple",
  "aeropuerto",
  "sucursal",
  "especial",
];

const TYPE_ICON: Record<TripType, ReactNode> = {
  redondo: <Icon name="swap" />,
  simple: <Icon name="arrow" />,
  doble: <span>2</span>,
  triple: <span>3</span>,
  aeropuerto: <Icon name="plane" />,
  sucursal: <Icon name="building" />,
  especial: <Icon name="star" />,
};

// Entrada = people who ENTER the plant (arrival time); salida = people who
// EXIT it (departure time). Both times are stamped by the app, never typed.
const DIR_INFO: Record<
  Direction,
  { title: string; short: string; timeLabel: string; icon: "login" | "logout" }
> = {
  entra: {
    title: "Quién entra a planta",
    short: "Entra",
    timeLabel: "Llegada a planta",
    icon: "login",
  },
  sale: {
    title: "Quién sale de planta",
    short: "Sale",
    timeLabel: "Salida de planta",
    icon: "logout",
  },
};
const DIRECTIONS: Direction[] = ["entra", "sale"];

type Mode = "entra" | "sale" | "ambas";

const moneyFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

function money(cents: number): string {
  return moneyFmt.format(cents / 100);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateStr(new Date());
}

// Current wall-clock time of the phone as HH:MM — this is the automatic stamp.
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function mondayOf(s: string): string {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

const dayFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const shortDayFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
});

function fmtDay(s: string): string {
  const t = dayFmt.format(parseDate(s));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fmtRange(from: string, to: string): string {
  return `${shortDayFmt.format(parseDate(from))} – ${shortDayFmt.format(parseDate(to))}`;
}

function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h = "0", m = "00"] = t.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "p. m." : "a. m.";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

// Latest stamped time of the trip (arrival or departure); "" if it has none.
function tripTimeKey(t: Trip): string {
  const times = [t.arrive_time, t.depart_time]
    .filter((x): x is string => !!x)
    .sort();
  return times[times.length - 1] ?? "";
}

interface FormState {
  id: number | null;
  date: string;
  type: TripType;
  amountPesos: string;
  mode: Mode;
  people: Record<Direction, string[]>;
  // null = not stamped yet; it is stamped automatically when saving.
  times: Record<Direction, string | null>;
  note: string;
}

const emptyForm = (rates: Map<TripType, number>, type: TripType): FormState => ({
  id: null,
  date: todayStr(),
  type,
  amountPesos:
    type === "especial" ? "" : String((rates.get(type) ?? 0) / 100),
  mode: type === "redondo" ? "ambas" : "entra",
  people: { entra: [], sale: [] },
  times: { entra: null, sale: null },
  note: "",
});

function visibleDirs(mode: Mode): Direction[] {
  return mode === "ambas" ? DIRECTIONS : [mode];
}

export function App() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayStr()));
  const [personFilter, setPersonFilter] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  // Days start closed (only their summary shows); tap a day to open it.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showRates, setShowRates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const currentWeekStart = mondayOf(todayStr());
  const filtering = personFilter !== "";
  const from = filtering ? "2000-01-01" : weekStart;
  const to = filtering ? "2100-12-31" : addDays(weekStart, 6);

  const ratesQuery = useQuery({
    queryKey: ["rates"],
    queryFn: () => api.getRates({}),
  });
  const rates = useMemo(() => {
    const m = new Map<TripType, number>();
    for (const r of ratesQuery.data?.rates ?? []) m.set(r.type, r.amount_cents);
    return m;
  }, [ratesQuery.data]);

  const tripsQuery = useQuery({
    queryKey: ["trips", from, to, personFilter],
    queryFn: () =>
      api.listTrips({
        from,
        to,
        ...(filtering ? { person: personFilter } : {}),
      }),
  });
  const trips = tripsQuery.data?.trips ?? [];

  const peopleQuery = useQuery({
    queryKey: ["people"],
    queryFn: () => api.listPeople({}),
  });
  const catalog = peopleQuery.data?.people ?? [];

  const historyQuery = useQuery({
    queryKey: ["week-history"],
    queryFn: () => api.weekHistory({}),
    enabled: showHistory,
  });

  const totalCents = trips.reduce((s, t) => s + t.amount_cents, 0);

  const byType = useMemo(() => {
    const m = new Map<TripType, { count: number; cents: number }>();
    for (const t of trips) {
      const e = m.get(t.type) ?? { count: 0, cents: 0 };
      e.count += 1;
      e.cents += t.amount_cents;
      m.set(t.type, e);
    }
    return TYPE_ORDER.filter((t) => m.has(t)).map((t) => ({
      type: t,
      ...(m.get(t) as { count: number; cents: number }),
    }));
  }, [trips]);

  const byDay = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of trips) {
      const list = m.get(t.date) ?? [];
      list.push(t);
      m.set(t.date, list);
    }
    // Newest first: days descending, and inside each day by the time that was
    // stamped (latest of arrival/departure) so the most recent trip is on top.
    // Trips without any time go to the bottom of their day.
    for (const list of m.values()) {
      list.sort((a, b) => {
        const ka = tripTimeKey(a);
        const kb = tripTimeKey(b);
        return ka > kb ? -1 : ka < kb ? 1 : b.id - a.id;
      });
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [trips]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["trips"] });
    void queryClient.invalidateQueries({ queryKey: ["people"] });
    void queryClient.invalidateQueries({ queryKey: ["week-history"] });
  };

  const addMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const dirs = visibleDirs(f.mode);
      const people = dirs.flatMap((d) =>
        f.people[d].map((name) => ({ name, direction: d })),
      );
      // Times are automatic: use the stamp if there is one; otherwise stamp
      // "now" for every visible leg that has people.
      const stamp = (d: Direction): string | null => {
        if (!dirs.includes(d)) return null;
        return f.times[d] ?? (f.people[d].length > 0 ? nowHHMM() : null);
      };
      const base = {
        date: f.date,
        type: f.type,
        amount_cents: Math.round(Number(f.amountPesos) * 100),
        arrive_time: stamp("entra"),
        depart_time: stamp("sale"),
        note: f.note.trim() ? f.note.trim() : null,
        people,
      };
      return f.id != null
        ? await api.updateTrip({ id: f.id, ...base })
        : await api.addTrip(base);
    },
    onSuccess: (_data, f) => {
      invalidate();
      setExpandedDays((cur) => new Set(cur).add(f.date));
      setForm(null);
      setFormError(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: (e) => setFormError(`No se pudo guardar: ${String(e)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await api.deleteTrip({ id }),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
      setSelectedTripId(null);
    },
  });

  const rateMutation = useMutation({
    mutationFn: async (args: { type: TripType; amount_cents: number }) =>
      await api.updateRate(args),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["rates"] }),
  });

  const addPersonMutation = useMutation({
    mutationFn: async (name: string) => await api.addPerson({ name }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["people"] }),
  });

  const removePersonMutation = useMutation({
    mutationFn: async (name: string) => await api.removePerson({ name }),
    onSuccess: (_d, name) => {
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      if (personFilter.toLowerCase() === name.toLowerCase()) setPersonFilter("");
    },
  });

  function toggleDay(date: string, dayTrips: Trip[]) {
    const collapsing = expandedDays.has(date);
    setExpandedDays((cur) => {
      const next = new Set(cur);
      if (collapsing) next.delete(date);
      else next.add(date);
      return next;
    });
    // A hidden trip can't stay selected.
    if (collapsing && dayTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(null);
      setConfirmDeleteId(null);
    }
  }

  function selectTrip(id: number) {
    setConfirmDeleteId(null);
    setSelectedTripId((cur) => (cur === id ? null : id));
  }

  function openNew(type: TripType) {
    setSelectedTripId(null);
    setForm(emptyForm(rates, type));
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(t: Trip) {
    setSelectedTripId(null);
    setConfirmDeleteId(null);
    const people: Record<Direction, string[]> = { entra: [], sale: [] };
    for (const p of t.people) people[p.direction].push(p.name);
    const hasEntra = people.entra.length > 0 || t.arrive_time != null;
    const hasSale = people.sale.length > 0 || t.depart_time != null;
    setForm({
      id: t.id,
      date: t.date,
      type: t.type,
      amountPesos: String(t.amount_cents / 100),
      mode: hasEntra && hasSale ? "ambas" : hasSale ? "sale" : "entra",
      people,
      times: { entra: t.arrive_time, sale: t.depart_time },
      note: t.note ?? "",
    });
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const total = visibleDirs(form.mode).reduce(
      (n, d) => n + form.people[d].length,
      0,
    );
    if (total === 0) {
      setFormError("Elige al menos una persona.");
      return;
    }
    if (form.amountPesos === "" || Number.isNaN(Number(form.amountPesos))) {
      setFormError("Escribe el monto del viaje.");
      return;
    }
    if (form.type === "especial" && form.note.trim() === "") {
      setFormError("Los viajes especiales se describen en cada ocasión: escribe la descripción.");
      return;
    }
    addMutation.mutate(form);
  }

  const isCurrentWeek = weekStart === currentWeekStart;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-32">
        {/* Top bar */}
        <header className="pt-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">
              Mis viajes
            </p>
            <h1 className="text-xl font-bold leading-6">Registro de viajes</h1>
          </div>
        </header>

        {/* Week navigation + hero total */}
        <section className="hero mt-4 px-5 pb-6 pt-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Semana anterior"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="hero-btn"
            >
              <Icon name="chevron-left" size={20} />
            </button>
            <div className="text-center">
              <p className="hero-dim text-sm">
                {filtering
                  ? "Todos los viajes"
                  : isCurrentWeek
                    ? "Esta semana"
                    : "Semana"}
              </p>
              {!filtering && (
                <p className="text-base font-semibold">
                  {fmtRange(weekStart, addDays(weekStart, 6))}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Semana siguiente"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="hero-btn"
            >
              <Icon name="chevron-right" size={20} />
            </button>
          </div>

          {!isCurrentWeek && !filtering && (
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setWeekStart(currentWeekStart)}
                className="hero-chip"
              >
                Volver a esta semana
              </button>
            </div>
          )}

          <div className="mt-5 text-center">
            <p className="hero-dim text-sm">
              {filtering
                ? `Total de viajes con ${personFilter}`
                : isCurrentWeek
                  ? "Vas a recibir"
                  : "Recibiste"}
            </p>
            <p className="text-5xl font-extrabold tabular-nums tracking-tight">
              {tripsQuery.isPending ? "…" : money(totalCents)}
            </p>
            <p className="hero-dim mt-1 text-sm">
              {trips.length} {trips.length === 1 ? "viaje" : "viajes"}
              {savedFlash && (
                <span className="hero-chip ml-2 font-medium">
                  <Icon name="check" size={14} stroke={2.6} /> Viaje guardado
                </span>
              )}
            </p>
          </div>

          {byType.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {byType.map((b) => (
                <span key={b.type} className="hero-chip">
                  {b.count} × {TYPE_LABELS[b.type]} ·{" "}
                  <span className="font-semibold">{money(b.cents)}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Trip form */}
        {form && (
          <TripForm
            form={form}
            setForm={setForm}
            catalog={catalog}
            onAddPerson={(name) => addPersonMutation.mutateAsync(name)}
            onSubmit={submitForm}
            onCancel={() => {
              setForm(null);
              setFormError(null);
            }}
            error={formError}
            saving={addMutation.isPending}
            rates={rates}
          />
        )}

        {/* Person filter (tap, no typing) */}
        {catalog.length > 0 && (
          <section className="mt-7">
            <h2 className="section-title">Ver viajes de</h2>
            <div className="scroll-x mt-2">
              <button
                type="button"
                className="chip"
                aria-pressed={!filtering}
                onClick={() => setPersonFilter("")}
              >
                Todas
              </button>
              {catalog.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="chip"
                  aria-pressed={personFilter === p}
                  onClick={() => setPersonFilter(personFilter === p ? "" : p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Trip list */}
        <section className="mt-6">
          <h2 className="section-title">
            {filtering ? "Viajes encontrados" : "Viajes de la semana"}
          </h2>
          {tripsQuery.isPending && (
            <p className="mt-3 text-sm text-[var(--dim)]">Cargando…</p>
          )}
          {tripsQuery.error && (
            <p className="mt-3 text-sm text-[var(--danger)]">
              No se pudieron cargar los viajes.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void tripsQuery.refetch()}
              >
                Reintentar
              </button>
            </p>
          )}
          {!tripsQuery.isPending && trips.length === 0 && (
            <div className="card mt-3 p-5 text-center text-sm text-[var(--dim)]">
              {filtering
                ? `Ningún viaje registrado con ${personFilter}.`
                : "Todavía no registras viajes en esta semana. Toca un tipo de viaje arriba para agregar el primero."}
            </div>
          )}
          {byDay.map(([date, dayTrips]) => {
            const collapsed = !expandedDays.has(date);
            const total = dayTrips.reduce((n, t) => n + t.amount_cents, 0);
            const counts = TYPE_ORDER.map((ty) => ({
              type: ty,
              n: dayTrips.filter((t) => t.type === ty).length,
            })).filter((c) => c.n > 0);
            return (
              <div key={date} className="mt-5">
                <button
                  type="button"
                  className="day-head"
                  data-collapsed={collapsed}
                  aria-expanded={!collapsed}
                  onClick={() => toggleDay(date, dayTrips)}
                >
                  <span
                    className="day-chevron"
                    style={{ transform: collapsed ? "none" : "rotate(90deg)" }}
                  >
                    <Icon name="chevron-right" size={18} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="day-name block">{fmtDay(date)}</span>
                    {collapsed && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {counts.map((c) => (
                          <span key={c.type} className="chip chip-sm chip-static">
                            {c.n} × {TYPE_LABELS[c.type]}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  {collapsed && (
                    <span className="text-right">
                      <span className="block text-lg font-bold tabular-nums text-[var(--accent-ink)]">
                        {money(total)}
                      </span>
                      <span className="block text-xs text-[var(--dim)]">
                        {dayTrips.length}{" "}
                        {dayTrips.length === 1 ? "viaje" : "viajes"}
                      </span>
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <ul className="pop-in mt-2 space-y-3">
                    {dayTrips.map((t) => (
                      <TripCard
                        key={t.id}
                        trip={t}
                        selected={selectedTripId === t.id}
                        onToggle={() => selectTrip(t.id)}
                        confirmingDelete={confirmDeleteId === t.id}
                        onEdit={() => openEdit(t)}
                        onAskDelete={() => setConfirmDeleteId(t.id)}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        onDelete={() => deleteMutation.mutate(t.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        {/* People catalog */}
        <Collapsible
          icon="users"
          title="Personas"
          open={showPeople}
          onToggle={() => setShowPeople(!showPeople)}
        >
          <PeopleManager
            catalog={catalog}
            onAdd={(name) => addPersonMutation.mutateAsync(name)}
            onRemove={(name) => removePersonMutation.mutate(name)}
          />
        </Collapsible>

        {/* Rates editor */}
        <Collapsible
          icon="coins"
          title="Tarifas por tipo de viaje"
          open={showRates}
          onToggle={() => setShowRates(!showRates)}
        >
          <div className="space-y-2">
            {TYPE_ORDER.filter((t) => t !== "especial").map((t) => (
              <RateRow
                key={t}
                label={TYPE_LABELS[t]}
                cents={rates.get(t) ?? 0}
                saving={
                  rateMutation.isPending && rateMutation.variables?.type === t
                }
                onSave={(cents) =>
                  rateMutation.mutate({ type: t, amount_cents: cents })
                }
              />
            ))}
            <p className="text-sm text-[var(--dim)]">
              El viaje especial no tiene tarifa fija: su monto se escribe en
              cada registro.
            </p>
          </div>
        </Collapsible>

        {/* Week history */}
        <Collapsible
          icon="history"
          title="Semanas anteriores"
          open={showHistory}
          onToggle={() => setShowHistory(!showHistory)}
        >
          {historyQuery.isPending && (
            <p className="text-sm text-[var(--dim)]">Cargando…</p>
          )}
          {(historyQuery.data?.weeks ?? []).length === 0 &&
            !historyQuery.isPending && (
              <p className="text-sm text-[var(--dim)]">
                Aún no hay semanas con viajes registrados.
              </p>
            )}
          <ul className="space-y-2">
            {(historyQuery.data?.weeks ?? []).map((w) => (
              <li key={w.week_start}>
                <button
                  type="button"
                  onClick={() => {
                    setWeekStart(w.week_start);
                    setPersonFilter("");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="card flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span>
                    <span className="block font-semibold">
                      {fmtRange(w.week_start, w.week_end)}
                    </span>
                    <span className="block text-sm text-[var(--dim)]">
                      {w.trip_count} {w.trip_count === 1 ? "viaje" : "viajes"}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums text-[var(--accent-ink)]">
                    {money(w.total_cents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Collapsible>
      </main>

      {!form && <QuickAddDial rates={rates} onPick={openNew} />}
    </div>
  );
}

// Floating "+" near the right thumb. Opens a speed-dial upward: cheapest type
// closest to the thumb, then by price, and the open-amount "Especial" farthest.
function QuickAddDial({
  rates,
  onPick,
}: {
  rates: Map<TripType, number>;
  onPick: (t: TripType) => void;
}) {
  const [open, setOpen] = useState(false);
  const types = useMemo(() => {
    const fixed = TYPE_ORDER.filter((t) => t !== "especial").sort(
      (a, b) =>
        (rates.get(a) ?? 0) - (rates.get(b) ?? 0) ||
        TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b),
    );
    return [...fixed, "especial" as TripType];
  }, [rates]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="dial-scrim"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className="dial">
        {open && (
          <div className="dial-list" role="menu" aria-label="Tipo de viaje">
            {types.map((t, i) => (
              <button
                key={t}
                type="button"
                role="menuitem"
                className="dial-item"
                style={{ "--i": i } as CSSProperties}
                onClick={() => {
                  setOpen(false);
                  onPick(t);
                }}
              >
                <span className="dial-label">
                  <span className="block text-base font-semibold leading-5">
                    {TYPE_LABELS[t]}
                  </span>
                  <span className="block text-sm tabular-nums text-[var(--accent-ink)]">
                    {t === "especial" ? "Monto libre" : money(rates.get(t) ?? 0)}
                  </span>
                </span>
                <span className="badge-icon">{TYPE_ICON[t]}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="fab"
          aria-label={open ? "Cerrar opciones" : "Agregar viaje"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ transform: open ? "rotate(45deg)" : "none" }}
        >
          <Icon name="plus" size={28} stroke={2.4} />
        </button>
      </div>
    </>
  );
}

function Collapsible({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: "users" | "coins" | "history";
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="card flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[var(--accent-ink)]">
          <Icon name={icon} size={20} />
        </span>
        <span className="flex-1 font-semibold">{title}</span>
        <span
          className="text-[var(--dim)] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <Icon name="chevron-right" size={18} />
        </span>
      </button>
      {open && <div className="pop-in mt-3">{children}</div>}
    </section>
  );
}

function TripCard({
  trip: t,
  selected,
  onToggle,
  confirmingDelete,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  trip: Trip;
  selected: boolean;
  onToggle: () => void;
  confirmingDelete: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const legs = DIRECTIONS.map((d) => ({
    dir: d,
    names: t.people.filter((p) => p.direction === d).map((p) => p.name),
    time: fmtTime(d === "entra" ? t.arrive_time : t.depart_time),
  })).filter((l) => l.names.length > 0 || l.time);

  return (
    <li className="card trip-card" data-selected={selected}>
      {/* Tap the trip to select it and reveal Editar / Eliminar */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={selected}
        aria-label={`${TYPE_LABELS[t.type]}, ${money(t.amount_cents)}. ${
          selected ? "Quitar selección" : "Seleccionar para editar o eliminar"
        }`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer p-3"
      >
        <div className="flex items-center gap-3">
          <span className="badge-icon">{TYPE_ICON[t.type]}</span>
          <span className="flex-1 text-base font-semibold">
            {TYPE_LABELS[t.type]}
          </span>
          <span className="text-lg font-bold tabular-nums text-[var(--accent-ink)]">
            {money(t.amount_cents)}
          </span>
        </div>

        {legs.length > 0 && (
          <div className="mt-3 space-y-2">
            {legs.map((l) => (
              <div key={l.dir} className="leg p-2.5" data-dir={l.dir}>
                <div className="flex items-center justify-between gap-2">
                  <span className="leg-title text-sm">
                    <Icon name={DIR_INFO[l.dir].icon} size={16} />
                    {DIR_INFO[l.dir].short}
                  </span>
                  {l.time && (
                    <span className="leg-time">
                      <Icon name="clock" size={13} /> {l.time}
                    </span>
                  )}
                </div>
                {l.names.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.names.map((n) => (
                      <span key={n} className="tag">
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {t.note && <p className="mt-2 text-sm text-[var(--dim)]">{t.note}</p>}
      </div>

      {selected && (
        <div className="pop-in mx-3 mb-3 flex items-center gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" onClick={onEdit} className="btn btn-soft">
            Editar
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="btn btn-danger"
              >
                Confirmar eliminar
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="btn btn-ghost min-h-10"
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAskDelete}
              className="btn btn-ghost min-h-10 text-[var(--danger)]"
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function TripForm({
  form,
  setForm,
  catalog,
  onAddPerson,
  onSubmit,
  onCancel,
  error,
  saving,
  rates,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  catalog: string[];
  onAddPerson: (name: string) => Promise<unknown>;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  error: string | null;
  saving: boolean;
  rates: Map<TripType, number>;
}) {
  const [editAmount, setEditAmount] = useState(false);
  const [editDate, setEditDate] = useState(false);
  const isEdit = form.id != null;
  const amountVisible = editAmount || form.type === "especial";
  const dirs = visibleDirs(form.mode);
  const isToday = form.date === todayStr();

  function changeType(t: TripType) {
    setForm({
      ...form,
      type: t,
      amountPesos:
        t === "especial" ? form.amountPesos : String((rates.get(t) ?? 0) / 100),
    });
  }

  function togglePerson(d: Direction, name: string) {
    const list = form.people[d];
    const next = list.includes(name)
      ? list.filter((n) => n !== name)
      : [...list, name];
    setForm({ ...form, people: { ...form.people, [d]: next } });
  }

  async function createPerson(d: Direction, raw: string) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name === "") return;
    // If it already exists (ignoring case), just select the existing one.
    const existing = catalog.find((c) => c.toLowerCase() === name.toLowerCase());
    const finalName = existing ?? name;
    if (!existing) await onAddPerson(name);
    if (!form.people[d].includes(finalName)) {
      setForm({
        ...form,
        people: { ...form.people, [d]: [...form.people[d], finalName] },
      });
    }
  }

  return (
    <section className="card pop-in mt-7 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {isEdit ? "Editar viaje" : "Nuevo viaje"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="icon-btn h-9 w-9"
          aria-label="Cerrar formulario"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-5">
        {/* Type + amount + date */}
        <div className="flex items-center gap-3">
          <span className="badge-icon">{TYPE_ICON[form.type]}</span>
          <div className="min-w-0 flex-1">
            <label htmlFor="f-type" className="sr-only">
              Tipo de viaje
            </label>
            <select
              id="f-type"
              value={form.type}
              onChange={(e) => changeType(e.target.value as TripType)}
              className="input py-1.5 font-semibold"
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {!amountVisible && (
            <div className="text-right">
              <p className="text-2xl font-extrabold tabular-nums text-[var(--accent-ink)]">
                {money(Math.round(Number(form.amountPesos || 0) * 100))}
              </p>
              <button
                type="button"
                onClick={() => setEditAmount(true)}
                className="link"
              >
                Cambiar monto
              </button>
            </div>
          )}
        </div>

        {amountVisible && (
          <div>
            <label htmlFor="f-amount" className="text-sm text-[var(--dim)]">
              Monto ($)
            </label>
            <input
              id="f-amount"
              type="number"
              aria-label="Monto en pesos"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.amountPesos}
              onChange={(e) => setForm({ ...form, amountPesos: e.target.value })}
              placeholder="0"
              className="input mt-1 tabular-nums"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="leg-time bg-[var(--accent-soft)] text-[var(--accent-ink)]">
            {isToday ? "Hoy" : fmtDay(form.date)}
          </span>
          {!editDate && (
            <button
              type="button"
              onClick={() => setEditDate(true)}
              className="link"
            >
              Cambiar fecha
            </button>
          )}
        </div>
        {editDate && (
          <input
            id="f-date"
            type="date"
            aria-label="Fecha del viaje"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="input"
          />
        )}

        {/* Entra / Sale / Ambas */}
        <div>
          <p className="section-title mb-2">¿Qué registras?</p>
          <div className="seg" role="group" aria-label="Entrada o salida de planta">
            {(
              [
                ["entra", "Entrada"],
                ["sale", "Salida"],
                ["ambas", "Entra y sale"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={form.mode === m}
                onClick={() => setForm({ ...form, mode: m })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Legs */}
        {dirs.map((d) => (
          <LegCard
            key={d}
            dir={d}
            catalog={catalog}
            selected={form.people[d]}
            time={form.times[d]}
            allowEditTime={isEdit}
            onToggle={(name) => togglePerson(d, name)}
            onCreate={(name) => createPerson(d, name)}
            onTime={(t) =>
              setForm({ ...form, times: { ...form.times, [d]: t } })
            }
          />
        ))}

        <div>
          <label htmlFor="f-note" className="text-sm text-[var(--dim)]">
            {form.type === "especial"
              ? "Descripción del viaje especial"
              : "Nota (opcional)"}
          </label>
          <textarea
            id="f-note"
            aria-label="Nota del viaje"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            placeholder={
              form.type === "especial"
                ? "Describe en qué consistió este viaje…"
                : "Empresa, detalle, etc."
            }
            className="input mt-1"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {saving ? "Guardando…" : "Guardar viaje"}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

function LegCard({
  dir,
  catalog,
  selected,
  time,
  allowEditTime,
  onToggle,
  onCreate,
  onTime,
}: {
  dir: Direction;
  catalog: string[];
  selected: string[];
  time: string | null;
  allowEditTime: boolean;
  onToggle: (name: string) => void;
  onCreate: (name: string) => Promise<void>;
  onTime: (t: string | null) => void;
}) {
  const info = DIR_INFO[dir];
  const [adding, setAdding] = useState(catalog.length === 0);
  const [draft, setDraft] = useState("");
  const [fixTime, setFixTime] = useState(false);
  // Selected names that are no longer in the catalog still show as chips.
  const chips = [
    ...catalog,
    ...selected.filter(
      (s) => !catalog.some((c) => c.toLowerCase() === s.toLowerCase()),
    ),
  ];

  async function submitDraft() {
    const name = draft.trim();
    if (name === "") return;
    await onCreate(name);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="leg" data-dir={dir}>
      <div className="flex items-center justify-between gap-2">
        <span className="leg-title">
          <Icon name={info.icon} size={20} />
          {info.title}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((name) => (
          <button
            key={name}
            type="button"
            className="chip"
            aria-pressed={selected.includes(name)}
            onClick={() => onToggle(name)}
          >
            {selected.includes(name) && <Icon name="check" size={16} stroke={2.6} />}
            {name}
          </button>
        ))}
        {!adding && (
          <button
            type="button"
            className="chip chip-dashed"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={16} /> Nueva persona
          </button>
        )}
      </div>

      {chips.length === 0 && !adding && (
        <p className="mt-2 text-sm text-[var(--dim)]">
          Aún no hay personas guardadas.
        </p>
      )}

      {adding && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            aria-label="Nombre de la nueva persona"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitDraft();
              }
            }}
            placeholder="Nombre (solo esta vez)"
            className="input"
          />
          <button
            type="button"
            onClick={() => void submitDraft()}
            className="btn btn-soft shrink-0"
          >
            Agregar
          </button>
        </div>
      )}

      {/* Automatic time */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {time ? (
          <span className="leg-time">
            <Icon name="clock" size={14} /> {info.timeLabel}: {fmtTime(time)}
          </span>
        ) : (
          <span className="text-sm text-[var(--dim)]">
            {info.timeLabel}: se marca sola al guardar
          </span>
        )}
        <button
          type="button"
          className="link"
          onClick={() => onTime(nowHHMM())}
        >
          {time ? "Poner hora actual" : "Marcar ahora"}
        </button>
        {time && (
          <button
            type="button"
            className="text-sm text-[var(--dim)]"
            onClick={() => onTime(null)}
          >
            Quitar
          </button>
        )}
        {allowEditTime && (
          <button
            type="button"
            className="text-sm text-[var(--dim)] underline"
            onClick={() => setFixTime(!fixTime)}
          >
            Corregir hora
          </button>
        )}
      </div>
      {allowEditTime && fixTime && (
        <input
          type="time"
          aria-label={info.timeLabel}
          value={time ?? ""}
          onChange={(e) => onTime(e.target.value ? e.target.value : null)}
          className="input mt-2"
        />
      )}
    </div>
  );
}

function PeopleManager({
  catalog,
  onAdd,
  onRemove,
}: {
  catalog: string[];
  onAdd: (name: string) => Promise<unknown>;
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  async function add() {
    const name = draft.trim();
    if (name === "") return;
    await onAdd(name);
    setDraft("");
  }

  return (
    <div className="card p-4">
      <p className="text-sm text-[var(--dim)]">
        Escribes cada nombre una sola vez; después lo eliges con un toque al
        registrar un viaje.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {catalog.length === 0 && (
          <p className="text-sm text-[var(--dim)]">Todavía no hay personas.</p>
        )}
        {catalog.map((name) =>
          confirming === name ? (
            <span key={name} className="chip chip-static">
              ¿Quitar a {name}?
              <button
                type="button"
                className="font-bold text-[var(--danger)]"
                onClick={() => {
                  onRemove(name);
                  setConfirming(null);
                }}
              >
                Sí
              </button>
              <button
                type="button"
                className="text-[var(--dim)]"
                onClick={() => setConfirming(null)}
              >
                No
              </button>
            </span>
          ) : (
            <span key={name} className="chip chip-static">
              {name}
              <button
                type="button"
                aria-label={`Quitar a ${name}`}
                className="grid place-items-center text-[var(--dim)]"
                style={{ minHeight: 0 }}
                onClick={() => setConfirming(name)}
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ),
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          aria-label="Nombre de la persona"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Nueva persona"
          className="input"
        />
        <button type="button" onClick={() => void add()} className="btn btn-soft shrink-0">
          Agregar
        </button>
      </div>
    </div>
  );
}

function RateRow({
  label,
  cents,
  saving,
  onSave,
}: {
  label: string;
  cents: number;
  saving: boolean;
  onSave: (cents: number) => void;
}) {
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? String(cents / 100);
  const dirty = value != null && Math.round(Number(value) * 100) !== cents;
  return (
    <div className="card flex items-center gap-2 px-3 py-2">
      <label
        htmlFor={`rate-${label}`}
        className="w-28 shrink-0 text-sm font-semibold"
      >
        {label}
      </label>
      <span className="text-[var(--dim)]">$</span>
      <input
        id={`rate-${label}`}
        type="number"
        aria-label={`Tarifa de ${label} en pesos`}
        inputMode="decimal"
        min="0"
        step="any"
        value={shown}
        onChange={(e) => setValue(e.target.value)}
        className="input py-1 tabular-nums"
      />
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={() => {
          onSave(Math.round(Number(shown) * 100));
          setValue(null);
        }}
        className="btn btn-soft shrink-0 disabled:opacity-40"
      >
        {saving ? "…" : "Guardar"}
      </button>
    </div>
  );
}
