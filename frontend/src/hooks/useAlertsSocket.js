import { useEffect, useRef } from 'react';

// Derive the WebSocket endpoint from the API base URL by default. This keeps
// Vercel/Render deployments working without requiring a separate VITE_WS_BASE_URL
// variable, while still allowing an explicit override for custom setups.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
const configuredWsBase = (import.meta.env.VITE_WS_BASE_URL || '').trim();
const WS_BASE_URL = configuredWsBase || (() => {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  return `${wsBase}/ws/alerts/`;
})();

/**
 * useAlertsSocket — connects to the backend AlertConsumer at ws(s)://<host>/ws/alerts/
 * when a Channels endpoint is available.
 *
 * Backend wire format (core/consumers.py):
 *   - on connect:      { "message": "Connected to Alert WebSocket" }
 *   - pushed messages: { "message": { "type": "NEW_ALERT", "data": {...} } }
 */
export default function useAlertsSocket({ onMessage, onNewAlert } = {}) {
  const handlersRef = useRef({ onMessage, onNewAlert });
  handlersRef.current = { onMessage, onNewAlert };

  useEffect(() => {
    if (!WS_BASE_URL) return undefined;

    let socket = null;
    let reconnectTimer = null;
    let attempts = 0;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      socket = new WebSocket(WS_BASE_URL);

      socket.onopen = () => {
        attempts = 0;
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const payload = parsed?.message;
          if (payload && typeof payload === 'object' && payload.type) {
            handlersRef.current.onMessage?.(payload);
            if (payload.type === 'NEW_ALERT') {
              handlersRef.current.onNewAlert?.(payload.data);
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket alert message:', err);
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
