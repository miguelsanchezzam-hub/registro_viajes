DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  depart_time TEXT,
  arrive_time TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE trip_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  name TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE rates (
  type TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO rates (type, amount_cents) VALUES ('redondo', 35000);
--> statement-breakpoint
INSERT INTO rates (type, amount_cents) VALUES ('simple', 22000);
--> statement-breakpoint
INSERT INTO rates (type, amount_cents) VALUES ('doble', 28000);
--> statement-breakpoint
INSERT INTO rates (type, amount_cents) VALUES ('triple', 31000);
--> statement-breakpoint
INSERT INTO rates (type, amount_cents) VALUES ('aeropuerto', 50000);
--> statement-breakpoint
INSERT INTO rates (type, amount_cents) VALUES ('sucursal', 35000);
