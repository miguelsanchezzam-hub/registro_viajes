// Capa de datos de la app instalable (GitHub Pages).
// Funciona igual que "Mis finanzas": todo se guarda primero en el dispositivo y
// se sincroniza con un Apps Script que vive dentro de la Google Sheet.
// Pestañas de la hoja: Viajes, Personas, Tarifas.

export type Dir = "entra" | "sale";
export interface TripRec {
  id: number;
  date: string;
  type: string;
  amount_cents: number;
  depart_time: string | null;
  arrive_time: string | null;
  note: string | null;
  people: { name: string; direction: Dir }[];
  /** true cuando la hoja ya tiene la última versión de este viaje */
  synced?: boolean;
  /** true cuando la hoja ya lo devolvió al menos una vez */
  seen?: boolean;
  /** cuenta de cambios locales (para no marcar como enviado algo que cambió mientras se enviaba) */
  rev?: number;
}

export const DEFAULT_RATES: Record<string, number> = {
  redondo: 35000,
  simple: 22000,
  doble: 28000,
  triple: 31000,
  aeropuerto: 50000,
  sucursal: 35000,
};

interface Cache {
  trips: Map<number, TripRec>;
  people: string[];
  rates: Record<string, number>;
}
export const cache: Cache = { trips: new Map(), people: [], rates: { ...DEFAULT_RATES } };

interface Persisted {
  trips: TripRec[];
  people: string[];
  rates: Record<string, number>;
  settingsTs: number;
  settingsDirty: boolean;
  pendingDel: string[];
}

const DATA_KEY = "viajes-datos-v2";
const CFG_KEY = "viajes-conexion-v1";

/* ─────────── almacenamiento local ─────────── */
let memoryOnly = false;
function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(DATA_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Persisted>;
      return {
        trips: Array.isArray(d.trips) ? d.trips : [],
        people: Array.isArray(d.people) ? d.people : [],
        rates: { ...DEFAULT_RATES, ...(d.rates ?? {}) },
        settingsTs: Number(d.settingsTs) || 0,
        settingsDirty: d.settingsDirty === true,
        pendingDel: Array.isArray(d.pendingDel) ? d.pendingDel : [],
      };
    }
  } catch {
    memoryOnly = true;
  }
  return { trips: [], people: [], rates: { ...DEFAULT_RATES }, settingsTs: 0, settingsDirty: false, pendingDel: [] };
}
const st: Persisted = load();
for (const t of st.trips) cache.trips.set(t.id, t);
cache.people = [...st.people];
cache.rates = { ...st.rates };

function persist() {
  st.trips = [...cache.trips.values()];
  st.people = [...cache.people];
  st.rates = { ...cache.rates };
  try {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(st));
  } catch {
    memoryOnly = true;
  }
}

export interface Conn {
  url: string;
  token: string;
}
export function getConn(): Conn {
  try {
    const c = JSON.parse(window.localStorage.getItem(CFG_KEY) ?? "{}") as Partial<Conn>;
    return { url: String(c.url ?? ""), token: String(c.token ?? "") };
  } catch {
    return { url: "", token: "" };
  }
}
export function setConn(c: Conn) {
  try {
    window.localStorage.setItem(CFG_KEY, JSON.stringify({ url: c.url.trim(), token: c.token.trim() }));
  } catch {
    /* sin almacenamiento */
  }
}

/* ─────────── API para el resto de la app ─────────── */
export const ready: Promise<void> = Promise.resolve();
export const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

let changeListener: () => void = () => {};
export const onExternalChange = (fn: () => void) => {
  changeListener = fn;
};

export function saveTrip(t: TripRec) {
  const prev = cache.trips.get(t.id);
  cache.trips.set(t.id, { ...t, synced: false, seen: prev?.seen === true, rev: (prev?.rev ?? 0) + 1 });
  persist();
  void syncPending();
}
export function removeTrip(id: number) {
  const gone = cache.trips.get(id);
  cache.trips.delete(id);
  const sid = "t_" + id;
  if (gone && (gone.synced === true || gone.seen === true || inFlight.has(sid)) && !st.pendingDel.includes(sid)) {
    st.pendingDel.push(sid);
  }
  persist();
  void syncPending();
}
export function saveConfig() {
  st.settingsTs = Date.now();
  st.settingsDirty = true;
  persist();
  void syncPending();
}

/* ─────────── sincronización con el Apps Script ─────────── */
interface SheetRow {
  id: string;
  date: string;
  type: string;
  amount: number;
  arrive: string;
  depart: string;
  entran: string[];
  salen: string[];
  note: string;
}
interface Reply {
  ok: boolean;
  error?: string;
  items?: SheetRow[];
  settings?: { ts: number; people: string[]; rates: Record<string, number> } | null;
}

const toRow = (t: TripRec): SheetRow => ({
  id: "t_" + t.id,
  date: t.date,
  type: t.type,
  amount: t.amount_cents / 100,
  arrive: t.arrive_time ?? "",
  depart: t.depart_time ?? "",
  entran: t.people.filter((p) => p.direction === "entra").map((p) => p.name),
  salen: t.people.filter((p) => p.direction === "sale").map((p) => p.name),
  note: t.note ?? "",
});
const fromRow = (r: SheetRow): TripRec => ({
  id: Number(String(r.id).replace(/^t_/, "")),
  date: r.date,
  type: String(r.type || "especial").toLowerCase(),
  amount_cents: Math.round(Number(r.amount) * 100) || 0,
  arrive_time: r.arrive ? r.arrive : null,
  depart_time: r.depart ? r.depart : null,
  note: r.note ? r.note : null,
  people: [
    ...(r.entran ?? []).map((name) => ({ name, direction: "entra" as Dir })),
    ...(r.salen ?? []).map((name) => ({ name, direction: "sale" as Dir })),
  ],
});

export type SyncState = "sin-conexion-configurada" | "al-dia" | "sincronizando" | "pendiente" | "error";
export interface SyncInfo {
  state: SyncState;
  pending: number;
  /** código de error: token | hoja | red | offline | respuesta | otro */
  error: string | null;
  memoryOnly: boolean;
  lastOk: number | null;
}
let syncing = false;
let syncAgain = false;
let syncErr: string | null = null;
let lastOk: number | null = null;
let inFlight = new Set<string>();
let infoListener: () => void = () => {};
export const onSyncInfo = (fn: () => void) => {
  infoListener = fn;
};
const pendingTrips = () => [...cache.trips.values()].filter((t) => t.synced !== true).sort((a, b) => a.id - b.id);
const pendingCount = () => pendingTrips().length + st.pendingDel.length + (st.settingsDirty ? 1 : 0);

export function syncInfo(): SyncInfo {
  const c = getConn();
  const configured = c.url !== "" && c.token !== "";
  const pending = pendingCount();
  let state: SyncState = "al-dia";
  if (!configured) state = "sin-conexion-configurada";
  else if (syncing) state = "sincronizando";
  else if (syncErr) state = "error";
  else if (pending > 0) state = "pendiente";
  return { state, pending, error: syncErr, memoryOnly, lastOk };
}

export function errorText(code: string | null): string {
  switch (code) {
    case "token":
      return "El código secreto no coincide con el del script. Revísalo en Conexión.";
    case "configurar":
      return "Falta poner tu código secreto dentro del script (línea TOKEN).";
    case "hoja":
      return "El script no encontró una pestaña (Viajes, Personas o Tarifas) en tu hoja.";
    case "offline":
      return "Sin internet. Se enviará solo cuando vuelva la conexión.";
    case "red":
      return "No se pudo contactar al script. Revisa la URL o tu conexión.";
    case "respuesta":
      return "El script respondió algo inesperado. ¿Publicaste la nueva versión del script?";
    default:
      return "El script marcó un error" + (code ? ` (${code})` : "") + ".";
  }
}

export async function syncPending(manual = false): Promise<void> {
  const conn = getConn();
  if (!conn.url || !conn.token) {
    infoListener();
    return;
  }
  if (syncing) {
    syncAgain = true;
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    syncErr = "offline";
    infoListener();
    return;
  }
  syncing = true;
  syncErr = null;
  infoListener();

  const sent = pendingTrips().map((t) => ({ id: t.id, rev: t.rev ?? 0 }));
  const sentDel = [...st.pendingDel];
  const sentSettingsTs = st.settingsDirty ? st.settingsTs : null;
  inFlight = new Set(sent.map((s) => "t_" + s.id));
  let again = false;
  try {
    const payload = {
      app: "viajes",
      token: conn.token,
      rows: sent.map((s) => toRow(cache.trips.get(s.id)!)),
      deletes: sentDel,
      settings:
        sentSettingsTs !== null
          ? { ts: sentSettingsTs, people: [...cache.people], rates: Object.fromEntries(Object.entries(cache.rates).map(([k, v]) => [k, v / 100])) }
          : null,
    };
    let res: Response;
    try {
      res = await fetch(conn.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    } catch {
      throw { code: "red" };
    }
    let j: Reply;
    try {
      j = (await res.json()) as Reply;
    } catch {
      throw { code: "respuesta" };
    }
    if (!j || j.ok !== true || !Array.isArray(j.items)) throw { code: j?.error ?? "respuesta" };

    // 1) lo enviado y confirmado
    st.pendingDel = st.pendingDel.filter((id) => !sentDel.includes(id));
    for (const s of sent) {
      const t = cache.trips.get(s.id);
      if (t && (t.rev ?? 0) === s.rev) {
        t.synced = true;
        t.seen = true;
      }
    }
    // 2) lo que dice la hoja
    const server = new Map<string, TripRec>();
    for (const r of j.items) {
      const t = fromRow(r);
      if (Number.isFinite(t.id) && t.date) server.set("t_" + t.id, t);
    }
    for (const t of [...cache.trips.values()]) {
      const sid = "t_" + t.id;
      const s = server.get(sid);
      if (s) {
        if (t.synced === true) cache.trips.set(t.id, { ...s, synced: true, seen: true, rev: t.rev ?? 0 });
        else t.seen = true;
      } else if (t.synced === true && t.seen === true && !inFlight.has(sid)) {
        cache.trips.delete(t.id); // borrado desde otro dispositivo o desde la hoja
      } else if (t.synced === true && t.seen !== true) {
        t.synced = false; // nunca apareció en la hoja: reenviar
        again = true;
      }
    }
    for (const [sid, s] of server) {
      if (!cache.trips.has(s.id) && !st.pendingDel.includes(sid)) cache.trips.set(s.id, { ...s, synced: true, seen: true, rev: 0 });
    }
    // 3) ajustes (personas y tarifas)
    if (sentSettingsTs !== null && st.settingsTs === sentSettingsTs) st.settingsDirty = false;
    if (!st.settingsDirty && j.settings) {
      cache.people = [...j.settings.people];
      cache.rates = { ...DEFAULT_RATES };
      for (const [k, v] of Object.entries(j.settings.rates)) if (k in DEFAULT_RATES) cache.rates[k] = Math.round(Number(v) * 100);
      st.settingsTs = Number(j.settings.ts) || st.settingsTs;
    }
    lastOk = Date.now();
    persist();
    changeListener();
  } catch (e) {
    syncErr = String((e as { code?: string })?.code ?? "otro");
    inFlight = new Set();
  } finally {
    inFlight = new Set();
    syncing = false;
    const sa = syncAgain;
    syncAgain = false;
    infoListener();
    if ((again || sa) && !syncErr) void syncPending();
  }
  void manual;
}

export async function testConnection(url: string, token: string): Promise<"ok" | "token" | "red" | "respuesta"> {
  try {
    const r = await fetch(url.trim() + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token.trim()));
    const j = (await r.json()) as { ok?: boolean; error?: string };
    if (j?.ok) return "ok";
    return j?.error === "token" ? "token" : "respuesta";
  } catch {
    return "red";
  }
}

window.addEventListener("online", () => void syncPending());
window.setInterval(() => {
  if (!document.hidden) void syncPending();
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void syncPending();
});
setTimeout(() => void syncPending(), 0);
