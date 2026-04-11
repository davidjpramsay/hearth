import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "@xyflow/react/dist/style.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./index.css";
import { App } from "./App";
import { initializeTheme, startThemeSync } from "./theme/theme";

registerSW({ immediate: true });
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
