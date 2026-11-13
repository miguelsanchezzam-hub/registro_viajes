import { spaceQueryClient } from "./sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  errorText,
  getConn,
  onExternalChange,
  onSyncInfo,
  setConn,
  syncInfo,
  syncPending,
  testConnection,
  type SyncInfo,
} from "./store";
import { initTheme } from "./theme";

initTheme();
onExternalChange(() => void spaceQueryClient.invalidateQueries());

const CHIP_TEXT: Record<SyncInfo["state"], string> = {
  "sin-conexion-configurada": "Conectar con Google Sheet",
  "al-dia": "Hoja al día",
  sincronizando: "Sincronizando…",
  pendiente: "Por enviar",
  error: "Sin sincronizar",
};

function SyncPanel({ info, onClose }: { info: SyncInfo; onClose: () => void }) {
  const initial = getConn();
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
    onClose();
    void syncPending(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conexión con Google Sheet"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(3,5,10,.55)", display: "flex", alignItems: "flex-end" }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxHeight: "92vh", overflow: "auto", borderRadius: "22px 22px 0 0", padding: 18, paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Conexión con Google Sheet</h2>
        <p style={{ margin: "6px 0 14px", fontSize: 13.5, color: "var(--dim)" }}>
          Pega la URL de tu script y el código secreto (los mismos que usas en «Mis finanzas»). Ver LEEME.
        </p>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)" }} htmlFor="c-url">URL del script</label>
        <input
          id="c-url"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{ marginBottom: 10 }}
        />
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)" }} htmlFor="c-token">Código secreto</label>
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
          style={{ marginBottom: 10 }}
        />
        {msg && (
          <p role="status" style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 600, color: msg.ok ? "var(--ok, #138a4a)" : "var(--danger)" }}>
            {msg.text}
          </p>
        )}
        {info.state === "error" && (
          <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--danger)" }}>{errorText(info.error)}</p>
        )}
        {info.memoryOnly && (
          <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--danger)" }}>
            Este navegador no deja guardar datos en el dispositivo; lo que registres se perdería al cerrar.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={save}>Guardar</button>
          <button type="button" className="btn btn-soft" onClick={() => void probe()} disabled={busy}>
            {busy ? "Probando…" : "Probar conexión"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void syncPending(true)}>Sincronizar ahora</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Root() {
  const [info, setInfo] = useState<SyncInfo>(syncInfo());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onSyncInfo(() => setInfo(syncInfo()));
    setInfo(syncInfo());
  }, []);
  const tone = info.state === "error" ? "var(--danger)" : info.state === "al-dia" ? "var(--accent-ink)" : "var(--dim)";
  const label = CHIP_TEXT[info.state] + (info.pending > 0 && info.state !== "al-dia" && info.state !== "sin-conexion-configurada" ? ` (${info.pending})` : "");
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px 0", paddingTop: "calc(8px + env(safe-area-inset-top))" }}>
        <button
          type="button"
          aria-label="Estado de la Google Sheet"
          onClick={() => (info.state === "sin-conexion-configurada" || info.state === "error" ? setOpen(true) : (void syncPending(true), setOpen(true)))}
          className="chip chip-sm"
          style={{ color: tone, fontWeight: 700 }}
        >
          {label}
        </button>
      </div>
      {info.state === "error" && (
        <p style={{ margin: "6px 12px 0", fontSize: 12.5, color: "var(--danger)", textAlign: "center" }}>{errorText(info.error)}</p>
      )}
      <App />
      {open && <SyncPanel info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing root");
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={spaceQueryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
