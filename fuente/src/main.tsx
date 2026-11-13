import { spaceQueryClient } from "./sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { onExternalChange } from "./store";
import { initTheme } from "./theme";

initTheme();
onExternalChange(() => void spaceQueryClient.invalidateQueries());

function Root() {
  return <App />;
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
