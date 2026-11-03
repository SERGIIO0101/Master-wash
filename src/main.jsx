import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Alto real visible (con el teclado abierto) para que las hojas no queden tapadas.
const vv = window.visualViewport;
if (vv) {
  const sync = () => {
    const r = document.documentElement.style;
    r.setProperty("--vvh", vv.height + "px");
    r.setProperty("--vvt", vv.offsetTop + "px");
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(<App />);
