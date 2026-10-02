import { useEffect, useRef } from "react";

const DEFAULT_API_BASE_URL = import.meta.env.PROD
  ? "/api"
  : "http://127.0.0.1:8000/api";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).trim();

// ``new WebSocket()`` rejects relative URLs, so a same-origin deployment
// (VITE_API_BASE_URL=/api) has to be expanded with the page's own host. The
// previous version produced "/ws/alerts/" and every handshake threw inside an
// empty catch, which silently disabled the live alert feed in production.
function resolveAlertsSocketUrl() {
  const configured = (import.meta.env.VITE_WS_BASE_URL || "").trim();
  if (configured) return configured;

  const origin = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  if (/^https?:\/\//i.test(origin)) {
    return `${origin.replace(/^http/i, "ws")}/ws/alerts/`;
  }
  if (typeof window !== "undefined" && window.location) {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}/ws/alerts/`;
  }
  return "";
}

const WS_BASE_URL = resolveAlertsSocketUrl();

export function useAlertsSocket(onNewAlert) {
  const handlerRef = useRef(onNewAlert);
  handlerRef.current = onNewAlert;

  useEffect(() => {
    if (!WS_BASE_URL) return undefined;

    let socket = null;
    let reconnectTimer = null;
    let attempts = 0;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      try {
        socket = new WebSocket(WS_BASE_URL);

        socket.onopen = () => {
          attempts = 0;
        };

        socket.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const payload = parsed?.message;
            if (payload && typeof payload === "object" && payload.type) {
              if (payload.type === "NEW_ALERT") {
                handlerRef.current?.(payload.data);
              }
            }
          } catch (err) {
            console.error("Failed to parse WebSocket alert message:", err);
          }
        };

        socket.onerror = () => {
          socket?.close();
        };

        socket.onclose = () => {
          if (unmounted) return;
          const delay = Math.min(1000 * 2 ** attempts, 30000);
          attempts += 1;
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch (error) {
        // Keep the REST dashboard usable, but never hide why live push is off.
        console.warn("Alert WebSocket unavailable:", error?.message || error);
      }
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);
}

export default useAlertsSocket;
