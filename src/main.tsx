import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./AuthGate";
import { DialogProvider } from "./components/ui/Dialog";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <DialogProvider>
        <AuthGate />
      </DialogProvider>
    </React.StrictMode>
  );
}
