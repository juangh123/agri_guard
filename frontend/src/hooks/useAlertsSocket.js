import { useEffect, useRef } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ||
  `${API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '')}/ws/alerts/`;

/**
 * useAlertsSocket — connects to the backend AlertConsumer at ws(s)://<host>/ws/alerts/
 * (in dev, vite proxies '/ws' to Django, see vite.config.js).
 *
 * Backend wire format (core/consumers.py):
 *   - on connect:      { "message": "Connected to Alert WebSocket" }   // plain string ack
 *   - pushed messages: { "message": { "type": "NEW_ALERT", "data": {...} } }
 *
 * Features:
 *   - exponential backoff reconnect (1s initial, doubling, capped at 30s)
 *   - closes the socket and stops reconnecting when the component unmounts
 *   - parses messages and dispatches by payload.type via callbacks
 *
 * @param {object}   handlers
 * @param {function} [handlers.onMessage]  - called with every typed payload { type, data }
 * @param {function} [handlers.onNewAlert] - called with payload.data for type === 'NEW_ALERT'
 */
export default function useAlertsSocket({ onMessage, onNewAlert } = {}) {
  // Keep latest handlers in a ref so the socket never needs to reconnect
  // when the parent re-renders with new callback identities.
  const handlersRef = useRef({ onMessage, onNewAlert });
  handlersRef.current = { onMessage, onNewAlert };

  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;
    let attempts = 0;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      socket = new WebSocket(WS_BASE_URL);

      socket.onopen = () => {
        attempts = 0; // reset backoff after a successful connection
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const payload = parsed?.message;
          // Consumer wraps group messages as { message: { type, data } };
          // the connection ack is { message: "..." } (string) and is ignored here.
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
        // Let onclose handle the reconnect logic.
        socket?.close();
      };

      socket.onclose = () => {
        if (unmounted) return;
        // Exponential backoff: 1s, 2s, 4s, ... capped at 30s.
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
        socket.onclose = null; // prevent reconnect after intentional close
        socket.close();
      }
    };
  }, []);
}
