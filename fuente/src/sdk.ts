import { QueryClient } from "@tanstack/react-query";
import { createElement } from "react";

export const spaceQueryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

/** Franja que tapa la zona del notch/barra de estado con el color de fondo. */
export function SafeAreaTopScrim({ backgroundColor }: { backgroundColor?: string }) {
  return createElement("div", {
    "aria-hidden": true,
    style: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: "env(safe-area-inset-top)",
      background: backgroundColor ?? "transparent",
      zIndex: 40,
      pointerEvents: "none",
    },
  });
}
