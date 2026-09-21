import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import App from "./App";
import { setMasterVolume } from "./audio";
import { loadPrefs } from "./prefs";
import { AuthProvider } from "./useAuth";
import "./index.css";

setMasterVolume(loadPrefs().volume / 100);

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
);
