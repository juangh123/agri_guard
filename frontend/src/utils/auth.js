const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

// Judges should never hit a login wall: the demo account is provisioned by
// seed_demo_data and only used for the public walkthrough.
const DEMO_CREDENTIALS = { username: "demo", password: "demo123" };

let inFlightLogin = null;

export function hasStoredSession() {
  return Boolean(localStorage.getItem("access_token"));
}

// Concurrent callers share one request so the dashboard bootstrap, the 401
// recovery path and the WebSocket setup never stampede /api/token/.
export function ensureDemoSession() {
  if (hasStoredSession()) {
    return Promise.resolve(localStorage.getItem("access_token"));
  }

  if (!inFlightLogin) {
    inFlightLogin = fetch(`${API_BASE_URL}/token/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(DEMO_CREDENTIALS),
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);
        localStorage.setItem("userName", DEMO_CREDENTIALS.username);
        return data.access;
      })
      .catch(() => null)
      .finally(() => {
        inFlightLogin = null;
      });
  }

  return inFlightLogin;
}

export default ensureDemoSession;
