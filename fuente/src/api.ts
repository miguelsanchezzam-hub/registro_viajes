// API de la app sobre el almacenamiento local (store.ts). Mismo contrato que usa App.tsx.
import { cache, newId, ready, removeTrip, saveConfig, saveTrip, type Dir, type TripRec } from "./store";

export type TripType = "redondo" | "simple" | "doble" | "triple" | "aeropuerto" | "sucursal" | "especial";
export interface Trip {
  id: number;
  date: string;
  type: TripType;
  amount_cents: number;
  depart_time: string | null;
  arrive_time: string | null;
  note: string | null;
  people: { name: string; direction: Dir }[];
}
interface TripInput {
  date: string;
  type: TripType;
  amount_cents: number;
  depart_time?: string | null;
  arrive_time?: string | null;
  note?: string | null;
  people: { name: string; direction: Dir }[];
}

export type ApiResponse<C, K extends keyof C> = C[K] extends (...a: never[]) => Promise<infer R> ? R : never;

const TYPES = ["redondo", "simple", "doble", "triple", "aeropuerto", "sucursal"] as const;
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");
const collator = new Intl.Collator("es");

function cleanPeople(list: { name: string; direction: Dir }[]) {
  const seen = new Set<string>();
  const out: { name: string; direction: Dir }[] = [];
  for (const p of list) {
    const name = cleanName(p.name);
    if (name === "") continue;
    const key = `${p.direction}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, direction: p.direction });
  }
  return out;
}

// Add to the catalog every name that isn't there yet (compared ignoring case).
function ensureCatalog(names: string[]): boolean {
  const have = new Set(cache.people.map((n) => n.toLowerCase()));
  let changed = false;
  for (const n of names) {
    const k = n.toLowerCase();
    if (have.has(k)) continue;
    have.add(k);
    cache.people.push(n);
    changed = true;
  }
  return changed;
}

const fmt = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

export const api = {
  async getRates(_a: object) {
    await ready;
    return {
      rates: TYPES.map((type) => ({ type, amount_cents: cache.rates[type] ?? 0 })),
    };
  },

  async updateRate({ type, amount_cents }: { type: string; amount_cents: number }) {
    await ready;
    cache.rates[type] = amount_cents;
    saveConfig();
    return { ok: true as const };
  },

  async listTrips({ from, to, person }: { from: string; to: string; person?: string }) {
    await ready;
    let rows = [...cache.trips.values()].filter((t) => t.date >= from && t.date <= to);
    if (person && person.trim() !== "") {
      const needle = person.trim().toLowerCase();
      rows = rows.filter((t) => t.people.some((p) => p.name.toLowerCase().includes(needle)));
    }
    rows.sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
    return { trips: rows as Trip[] };
  },

  async listPeople(_a: object) {
    await ready;
    return { people: [...cache.people].sort(collator.compare) };
  },

  async addPerson({ name }: { name: string }) {
    await ready;
    const clean = cleanName(name);
    if (clean === "") throw new Error("empty name");
    const existing = cache.people.find((n) => n.toLowerCase() === clean.toLowerCase());
    if (existing) return { name: existing };
    cache.people.push(clean);
    saveConfig();
    return { name: clean };
  },

  async removePerson({ name }: { name: string }) {
    await ready;
    const key = cleanName(name).toLowerCase();
    cache.people = cache.people.filter((n) => n.toLowerCase() !== key);
    saveConfig();
    return { ok: true as const };
  },

  async addTrip(a: TripInput) {
    await ready;
    const people = cleanPeople(a.people);
    const rec: TripRec = {
      id: newId(),
      date: a.date,
      type: a.type,
      amount_cents: a.amount_cents,
      depart_time: a.depart_time ?? null,
      arrive_time: a.arrive_time ?? null,
      note: a.note?.trim() ? a.note.trim() : null,
      people,
    };
    saveTrip(rec);
    if (ensureCatalog(people.map((p) => p.name))) saveConfig();
    return { id: rec.id };
  },

  async updateTrip(a: TripInput & { id: number }) {
    await ready;
    if (!cache.trips.has(a.id)) throw new Error("trip not found");
    const people = cleanPeople(a.people);
    saveTrip({
      id: a.id,
      date: a.date,
      type: a.type,
      amount_cents: a.amount_cents,
      depart_time: a.depart_time ?? null,
      arrive_time: a.arrive_time ?? null,
      note: a.note?.trim() ? a.note.trim() : null,
      people,
    });
    if (ensureCatalog(people.map((p) => p.name))) saveConfig();
    return { ok: true as const };
  },

  async deleteTrip({ id }: { id: number }) {
    await ready;
    removeTrip(id);
    return { ok: true as const };
  },

  async weekHistory(_a: object) {
    await ready;
    const map = new Map<string, { week_start: string; week_end: string; total_cents: number; trip_count: number }>();
    const rows = [...cache.trips.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const r of rows) {
      const d = new Date(`${r.date}T00:00:00`);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const key = fmt(monday);
      const e = map.get(key) ?? { week_start: key, week_end: fmt(sunday), total_cents: 0, trip_count: 0 };
      e.total_cents += r.amount_cents;
      e.trip_count += 1;
      map.set(key, e);
    }
    return { weeks: [...map.values()] };
  },
};
