export const API_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const SOCKET_URL = String(
  import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "",
).replace(/\/$/, "");
