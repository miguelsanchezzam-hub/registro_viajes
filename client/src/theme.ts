// The theme always follows the device: light (azul rey + blanco) by day,
// dark (azul marino + negro) at night. No manual switch, nothing stored.

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = t === "dark" ? "#03050a" : "#f4f7ff";
}

// Call once before rendering; keeps following the device if it switches
// between day and night while the app is open.
export function initTheme() {
  applyTheme(systemTheme());
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => applyTheme(systemTheme()));
}
