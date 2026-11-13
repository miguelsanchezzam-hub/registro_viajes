import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One row per trip Miguel makes driving people to a company in León.
// `date` is the local calendar day (YYYY-MM-DD, America/Mexico_City).
// Only two moments matter at the plant, and each is stamped automatically
// by the app (never typed):
//   - `arriveTime`: arrival at the plant (HH:MM) — when people ENTER.
//   - `departTime`: departure from the plant (HH:MM) — when people EXIT.
// `amountCents` is the pay for the trip in cents (fixed per type, editable).
export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  type: text("type", {
    enum: [
      "redondo",
      "simple",
      "doble",
      "triple",
      "aeropuerto",
      "sucursal",
      "especial",
    ],
  }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  departTime: text("depart_time"),
  arriveTime: text("arrive_time"),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// People carried on a trip. `direction` says whether the person ENTERS the
// plant ("entra", uses the trip's arrival time) or EXITS it ("sale", uses the
// trip's departure time). A round trip (redondo) has both kinds.
export const tripPeople = sqliteTable("trip_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id")
    .notNull()
    .references(() => trips.id),
  name: text("name").notNull(),
  direction: text("direction", { enum: ["entra", "sale"] })
    .notNull()
    .default("entra"),
});

// Catalog of people Miguel drives. Names are typed once here and afterwards
// picked with a tap when registering a trip. Case-insensitive unique.
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

// Editable pay rates per trip type, in cents. Seeded with the exact rates
// Miguel gave (Redondo $350, Simple $220, Doble $280, Triple $310,
// Aeropuerto $500, Sucursal $350). "especial" has no fixed rate.
export const rates = sqliteTable("rates", {
  type: text("type").primaryKey(),
  amountCents: integer("amount_cents").notNull(),
});
