// Actions for the business-trip log.
//
// Miguel drives people to companies in León and is paid a fixed amount per
// trip type. Each trip records: date, type, amount (from the editable rate
// table, adjustable per trip), the two moments that matter at the plant —
// arrival (people who ENTER) and departure (people who EXIT), both stamped
// automatically by the app — the people carried, each tagged as entering or
// exiting the plant (a "redondo" has both), and an optional note (used to
// describe the rare "especial" trips). People are picked from a catalog so
// names are never retyped. The client computes week ranges (Mon–Sun) and
// asks for trips inside a range so it can show exactly what he will
// receive that week.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

const tripType = z.enum([
  "redondo",
  "simple",
  "doble",
  "triple",
  "aeropuerto",
  "sucursal",
  "especial",
]);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable()
  .optional();

const direction = z.enum(["entra", "sale"]);

const tripPerson = z.object({
  name: z.string().min(1).max(120),
  direction,
});

const tripOut = z.object({
  id: z.number(),
  date: z.string(),
  type: tripType,
  amount_cents: z.number(),
  depart_time: z.string().nullable(),
  arrive_time: z.string().nullable(),
  note: z.string().nullable(),
  people: z.array(tripPerson),
});

type TripPerson = z.infer<typeof tripPerson>;

function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// Trim names, drop blanks and exact duplicates (same name, same direction).
function cleanPeople(list: TripPerson[]): TripPerson[] {
  const seen = new Set<string>();
  const out: TripPerson[] = [];
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

// SQLite only ignores case for unaccented letters, so "María" vs "MARÍA" would
// slip through its NOCASE unique index. Compare names in code instead and
// return only the ones not yet in the catalog (first spelling wins).
async function missingFromCatalog(
  ctx: Ctx,
  names: string[],
): Promise<string[]> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select({ name: schema.people.name }).from(schema.people);
  const have = new Set(rows.map((r) => r.name.toLowerCase()));
  const missing: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    missing.push(n);
  }
  return missing;
}

type TripOut = z.infer<typeof tripOut>;

async function loadTrips(
  ctx: Ctx,
  args: { from: string; to: string; person?: string },
): Promise<TripOut[]> {
  const db = ctx.db<typeof schema>();
  const conds = [
    gte(schema.trips.date, args.from),
    lte(schema.trips.date, args.to),
  ];
  let rows = await db
    .select()
    .from(schema.trips)
    .where(and(...conds))
    .orderBy(asc(schema.trips.date), asc(schema.trips.id));

  const peopleRows = await db
    .select()
    .from(schema.tripPeople)
    .orderBy(asc(schema.tripPeople.id));
  const byTrip = new Map<number, TripPerson[]>();
  for (const p of peopleRows) {
    const list = byTrip.get(p.tripId) ?? [];
    list.push({ name: p.name, direction: p.direction });
    byTrip.set(p.tripId, list);
  }

  if (args.person && args.person.trim() !== "") {
    const needle = args.person.trim().toLowerCase();
    rows = rows.filter((r) =>
      (byTrip.get(r.id) ?? []).some((p) =>
        p.name.toLowerCase().includes(needle),
      ),
    );
  }

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type,
    amount_cents: r.amountCents,
    depart_time: r.departTime,
    arrive_time: r.arriveTime,
    note: r.note,
    people: byTrip.get(r.id) ?? [],
  }));
}

const tripInput = {
  date: dateStr,
  type: tripType,
  amount_cents: z.number().int().min(0),
  depart_time: timeStr,
  arrive_time: timeStr,
  note: z.string().max(500).nullable().optional(),
  people: z.array(tripPerson).max(60),
};

export const Actions = {
  getRates: defineAction({
    description:
      "Returns the current pay rate per trip type, in cents, so the form can prefill amounts.",
    request: z.object({}),
    response: z.object({
      rates: z.array(
        z.object({ type: tripType, amount_cents: z.number() }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.rates);
      return {
        rates: rows.map((r) => ({
          type: r.type as z.infer<typeof tripType>,
          amount_cents: r.amountCents,
        })),
      };
    },
  }),

  updateRate: defineAction({
    description:
      "Changes the saved pay rate for one trip type; future trips prefill with the new amount.",
    request: z.object({
      type: tripType,
      amount_cents: z.number().int().min(0),
    }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.rates)
        .values({ type: args.type, amountCents: args.amount_cents })
        .onConflictDoUpdate({
          target: schema.rates.type,
          set: { amountCents: args.amount_cents },
        });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listTrips: defineAction({
    description:
      "Lists trips between two dates (inclusive), each with the people carried; optionally filters to trips carrying a person whose name contains the given text.",
    request: z.object({
      from: dateStr,
      to: dateStr,
      person: z.string().max(120).optional(),
    }),
    response: z.object({ trips: z.array(tripOut) }),
    async handler(ctx, args) {
      return { trips: await loadTrips(ctx, args) };
    },
  }),

  listPeople: defineAction({
    description:
      "Lists the people in the catalog (names typed once, then picked with a tap), alphabetically.",
    request: z.object({}),
    response: z.object({ people: z.array(z.string()) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select({ name: schema.people.name })
        .from(schema.people)
        .orderBy(asc(schema.people.name));
      return { people: rows.map((r) => r.name) };
    },
  }),

  addPerson: defineAction({
    description:
      "Adds a person to the catalog so they can be picked on future trips. Does nothing if the name already exists (ignoring upper/lower case and accents in capitals). Returns the name as stored.",
    request: z.object({ name: z.string().min(1).max(120) }),
    response: z.object({ name: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const name = cleanName(args.name);
      if (name === "") throw new Error("addPerson: empty name");
      const missing = await missingFromCatalog(ctx, [name]);
      if (missing.length > 0) {
        await db.insert(schema.people).values({ name }).onConflictDoNothing();
        ctx.invalidateQueries();
        return { name };
      }
      const rows = await db.select({ name: schema.people.name }).from(schema.people);
      const stored = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      return { name: stored?.name ?? name };
    },
  }),

  removePerson: defineAction({
    description:
      "Removes a person from the catalog. Past trips keep the name they were registered with.",
    request: z.object({ name: z.string().min(1).max(120) }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const key = cleanName(args.name).toLowerCase();
      const rows = await db.select({ name: schema.people.name }).from(schema.people);
      for (const r of rows) {
        if (r.name.toLowerCase() === key) {
          await db.delete(schema.people).where(eq(schema.people.name, r.name));
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  addTrip: defineAction({
    description:
      "Registers a new trip with its type, amount, arrival/departure times at the plant and the people carried (each entering or exiting), and returns its id.",
    request: z.object(tripInput),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const inserted = await db
        .insert(schema.trips)
        .values({
          date: args.date,
          type: args.type,
          amountCents: args.amount_cents,
          departTime: args.depart_time ?? null,
          arriveTime: args.arrive_time ?? null,
          note: args.note?.trim() ? args.note.trim() : null,
        })
        .returning({ id: schema.trips.id });
      const row = inserted[0];
      if (!row) throw new Error("addTrip: insert returned no rows");
      const people = cleanPeople(args.people);
      if (people.length > 0) {
        await db.insert(schema.tripPeople).values(
          people.map((p) => ({
            tripId: row.id,
            name: p.name,
            direction: p.direction,
          })),
        );
        const missing = await missingFromCatalog(
          ctx,
          people.map((p) => p.name),
        );
        if (missing.length > 0) {
          await db
            .insert(schema.people)
            .values(missing.map((name) => ({ name })))
            .onConflictDoNothing();
        }
      }
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  updateTrip: defineAction({
    description:
      "Edits an existing trip: date, type, amount, arrival/departure times, note and its full list of people.",
    request: z.object({ id: z.number().int().positive(), ...tripInput }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const people = cleanPeople(args.people);
      const statements: BatchItem<"sqlite">[] = [
        db
          .update(schema.trips)
          .set({
            date: args.date,
            type: args.type,
            amountCents: args.amount_cents,
            departTime: args.depart_time ?? null,
            arriveTime: args.arrive_time ?? null,
            note: args.note?.trim() ? args.note.trim() : null,
          })
          .where(eq(schema.trips.id, args.id)),
        db
          .delete(schema.tripPeople)
          .where(eq(schema.tripPeople.tripId, args.id)),
      ];
      for (const p of people) {
        statements.push(
          db.insert(schema.tripPeople).values({
            tripId: args.id,
            name: p.name,
            direction: p.direction,
          }),
        );
      }
      for (const name of await missingFromCatalog(
        ctx,
        people.map((p) => p.name),
      )) {
        statements.push(
          db.insert(schema.people).values({ name }).onConflictDoNothing(),
        );
      }
      const [first, ...rest] = statements;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteTrip: defineAction({
    description: "Deletes one trip and its people list.",
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db.batch([
        db
          .delete(schema.tripPeople)
          .where(eq(schema.tripPeople.tripId, args.id)),
        db.delete(schema.trips).where(eq(schema.trips.id, args.id)),
      ]);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  weekHistory: defineAction({
    description:
      "Returns per-week totals (Monday to Sunday) for all recorded trips, newest week first, so past earnings can be reviewed.",
    request: z.object({}),
    response: z.object({
      weeks: z.array(
        z.object({
          week_start: z.string(),
          week_end: z.string(),
          total_cents: z.number(),
          trip_count: z.number(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select({ date: schema.trips.date, amountCents: schema.trips.amountCents })
        .from(schema.trips)
        .orderBy(desc(schema.trips.date));
      const map = new Map<
        string,
        { week_start: string; week_end: string; total_cents: number; trip_count: number }
      >();
      for (const r of rows) {
        const d = new Date(`${r.date}T00:00:00`);
        const dow = (d.getDay() + 6) % 7; // Monday = 0
        const monday = new Date(d);
        monday.setDate(d.getDate() - dow);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = (x: Date) =>
          `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
        const key = fmt(monday);
        const entry = map.get(key) ?? {
          week_start: key,
          week_end: fmt(sunday),
          total_cents: 0,
          trip_count: 0,
        };
        entry.total_cents += r.amountCents;
        entry.trip_count += 1;
        map.set(key, entry);
      }
      return { weeks: [...map.values()] };
    },
  }),
} satisfies ActionsModule;
