import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { TYPE_LABELS, TYPE_ORDER, type TripType } from "./comun";
import {
  errorText,
  getConn,
  onSyncInfo,
  setConn,
  syncInfo,
  syncPending,
  testConnection,
  type SyncInfo,
} from "./store";

/** Estado de la sincronización, siempre al día. */
export function useSyncInfo(): SyncInfo {
  const [info, setInfo] = useState<SyncInfo>(() => syncInfo());
  useEffect(() => {
    setInfo(syncInfo());
    return onSyncInfo(() => setInfo(syncInfo()));
  }, []);
  return info;
}

/** El script está desconectado: nunca se configuró o el último intento falló. */
export const isDisconnected = (i: SyncInfo) =>
  i.state === "error" || i.state === "sin-conexion-configurada";

function statusLine(i: SyncInfo): { text: string; bad: boolean } {
  switch (i.state) {
    case "sin-conexion-configurada":
      return { text: "Sin conectar con tu hoja. Pega la URL y el código para empezar.", bad: true };
    case "error":
      return { text: errorText(i.error), bad: true };
    case "sincronizando":
      return { text: "Sincronizando…", bad: false };
    case "pendiente":
      return { text: `Conectado · ${i.pending} ${i.pending === 1 ? "cambio por enviar" : "cambios por enviar"}`, bad: false };
    default:
      return { text: "Conectado · hoja al día", bad: false };
  }
}

export function ConfigButton({ onClick }: { onClick: () => void }) {
  const info = useSyncInfo();
  const bad = isDisconnected(info);
  return (
    <button
      type="button"
      onClick={onClick}
      className="icon-btn config-btn"
      data-disconnected={bad}
      aria-label={bad ? "Configuración — script desconectado" : "Configuración — conectado"}
      title={bad ? "Script desconectado" : "Conectado"}
    >
      <Icon name="settings" size={22} />
    </button>
  );
}

function SectionTitle({ icon, children }: { icon: "users" | "coins" | "settings"; children: string }) {
  return (
    <h3 className="cfg-title">
      <span className="text-[var(--accent-ink)]">
        <Icon name={icon} size={18} />
      </span>
      {children}
    </h3>
  );
}

function ConexionSection() {
  const info = useSyncInfo();
  const initial = getConn();
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const status = statusLine(info);

  async function probe() {
    if (!url.trim() || !token.trim()) {
      setMsg({ ok: false, text: "Escribe la URL y el código secreto." });
      return;
    }
    setBusy(true);
    const r = await testConnection(url, token);
    setBusy(false);
    setMsg(
      r === "ok"
        ? { ok: true, text: "Conexión correcta. Toca Guardar." }
        : r === "token"
          ? { ok: false, text: "El código secreto no coincide." }
          : r === "red"
            ? { ok: false, text: "No se pudo contactar al script. Revisa la URL y tu internet." }
            : { ok: false, text: "El script respondió algo inesperado. ¿Publicaste la nueva versión?" },
    );
  }
  function save() {
    setConn({ url, token });
    setMsg({ ok: true, text: "Guardado. Sincronizando…" });
    void syncPending(true);
  }

  return (
    <section className="cfg-section">
      <SectionTitle icon="settings">Conexión con Google Sheet</SectionTitle>
      <p
        role="status"
        className="cfg-status"
        data-bad={status.bad}
      >
        <span className="cfg-dot" aria-hidden="true" />
        {status.text}
      </p>
      <label className="cfg-label" htmlFor="c-url">URL del script</label>
      <input
        id="c-url"
        className="input"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://script.google.com/macros/s/.../exec"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <label className="cfg-label" htmlFor="c-token">Código secreto</label>
      <input
        id="c-token"
        className="input"
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="El mismo que pusiste en el script"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {msg && (
        <p role="status" className="mt-2 text-sm font-semibold" style={{ color: msg.ok ? "var(--ok)" : "var(--danger)" }}>
          {msg.text}
        </p>
      )}
      {info.memoryOnly && (
        <p className="mt-2 text-sm font-semibold text-[var(--danger)]">
          Este navegador no deja guardar datos en el dispositivo; lo que registres se perdería al cerrar.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={save}>Guardar</button>
        <button type="button" className="btn btn-soft" onClick={() => void probe()} disabled={busy}>
          {busy ? "Probando…" : "Probar conexión"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void syncPending(true)}>Sincronizar ahora</button>
      </div>
    </section>
  );
}

function PeopleSection({
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
    <section className="cfg-section">
      <SectionTitle icon="users">Personas</SectionTitle>
      <p className="text-sm text-[var(--dim)]">
        Escribes cada nombre una sola vez; después lo eliges con un toque al registrar un viaje.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {catalog.length === 0 && <p className="text-sm text-[var(--dim)]">Todavía no hay personas.</p>}
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
              <button type="button" className="font-bold" onClick={() => setConfirming(null)}>
                No
              </button>
            </span>
          ) : (
            <span key={name} className="chip chip-static">
              {name}
              <button
                type="button"
                aria-label={`Quitar a ${name}`}
                className="text-[var(--dim)]"
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
    </section>
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
      <label htmlFor={`rate-${label}`} className="w-28 shrink-0 text-sm font-semibold">
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

function RatesSection({
  rates,
  savingType,
  onSave,
}: {
  rates: Map<TripType, number>;
  savingType: TripType | null;
  onSave: (type: TripType, cents: number) => void;
}) {
  return (
    <section className="cfg-section">
      <SectionTitle icon="coins">Tarifas por tipo de viaje</SectionTitle>
      <div className="space-y-2">
        {TYPE_ORDER.filter((t) => t !== "especial").map((t) => (
          <RateRow
            key={t}
            label={TYPE_LABELS[t]}
            cents={rates.get(t) ?? 0}
            saving={savingType === t}
            onSave={(cents) => onSave(t, cents)}
          />
        ))}
        <p className="text-sm text-[var(--dim)]">
          El viaje especial no tiene tarifa fija: su monto se escribe en cada registro.
        </p>
      </div>
    </section>
  );
}

export function ConfigSheet({
  onClose,
  catalog,
  rates,
  savingRate,
  onAddPerson,
  onRemovePerson,
  onSaveRate,
}: {
  onClose: () => void;
  catalog: string[];
  rates: Map<TripType, number>;
  savingRate: TripType | null;
  onAddPerson: (name: string) => Promise<unknown>;
  onRemovePerson: (name: string) => void;
  onSaveRate: (type: TripType, cents: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cfg-scrim" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configuración"
        className="cfg-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cfg-head">
          <h2 className="text-lg font-extrabold">Configuración</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar configuración" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <ConexionSection />
        <PeopleSection catalog={catalog} onAdd={onAddPerson} onRemove={onRemovePerson} />
        <RatesSection rates={rates} savingType={savingRate} onSave={onSaveRate} />
      </div>
    </div>
  );
}
