import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "@xyflow/react/dist/style.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./index.css";
import { App } from "./App";
import { installRouteLoadRecovery } from "./routing/route-load-recovery";
import { initializeTheme, startThemeSync } from "./theme/theme";

const clearDevelopmentServiceWorkers = () => {
  if (typeof window === "undefined") {
    return;
  }

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch(() => undefined);
  }

  if ("caches" in window) {
    void window.caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .catch(() => undefined);
  }
};

if (import.meta.env.PROD) {
  installRouteLoadRecovery();
  registerSW({ immediate: true });
} else {
  clearDevelopmentServiceWorkers();
}

initializeTheme();
startThemeSync();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_relativeSplatPath: true,
        v7_startTransition: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
