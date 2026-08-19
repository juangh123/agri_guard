import { useTranslation } from "react-i18next";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Shield,
  Activity,
  Map as MapIcon,
  Clock,
  SlidersHorizontal,
  FileText,
  Smartphone,
  AlertTriangle,
  Bell,
  Search,
  X,
  Home,
  WifiOff,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import MapView from "../components/MapView";
import ClaimTimeline from "../components/ClaimTimeline";
import DashboardOverview from "../components/DashboardOverview";
import FarmerHome from "../components/FarmerHome";
import ReportQueryPanel from "../components/ReportQueryPanel";
import SettingsPanel from "../components/SettingsPanel";
import SmsMockup from "../components/SmsMockup";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { CommandPalette } from "../components/CommandPalette";
import { useAlertsSocket } from "../hooks/useAlertsSocket";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

const NAV_ITEMS = [
  { id: "overview", labelKey: "nav_overview", icon: Activity, farmerLabelKey: "nav_home", farmerIcon: Home },
  { id: "map", labelKey: "nav_map", icon: MapIcon },
  { id: "timeline", labelKey: "nav_claims", icon: Clock, farmerLabelKey: "nav_payments" },
  { id: "reports", labelKey: "nav_reports", icon: FileText },
  { id: "settings", labelKey: "nav_settings", icon: SlidersHorizontal },
  { id: "sms", labelKey: "nav_sms", icon: Smartphone },
];

const FARMER_TABS = ["overview", "map", "timeline", "sms"];

const ROLE_CONFIGS = {
  insurer: { labelKey: "role_insurer" },
  farmer: { labelKey: "role_farmer" },
  regulator: { labelKey: "role_regulator" },
};

function applyThemeClasses(theme, isFarmer) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("high-contrast", theme === "high-contrast");
  root.classList.toggle("farmer-mode", isFarmer);
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "overview");
  const [farms, setFarms] = useState([]);
  const [claims, setClaims] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedClaimNo, setSelectedClaimNo] = useState("");
  const [isDisasterActive, setIsDisasterActive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [userRole, setUserRole] = useState(() => localStorage.getItem("agri_guard_role") || "insurer");
  const [theme, setTheme] = useState(() => localStorage.getItem("agri_guard_theme") || "default");

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Offline resilience state
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    try {
      const snap = JSON.parse(localStorage.getItem("agri_guard_cache") || "null");
      return snap?.ts || null;
    } catch { return null; }
  });
  const [usingCachedData, setUsingCachedData] = useState(false);

  const isFarmer = userRole === "farmer";

  // Track connectivity; refetch fresh data when the connection comes back
  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      toast.success(t("online_restored"));
      fetchInitialDataRef.current?.();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [t]);

  // Apply theme + farmer-mode classes whenever they change (and on first load)
  useEffect(() => {
    applyThemeClasses(theme, isFarmer);
  }, [theme, isFarmer]);

  // Handle Role Change
  const handleRoleChange = (newRole) => {
    setUserRole(newRole);
    localStorage.setItem("agri_guard_role", newRole);
    // Farmers only have a simplified tab set — bounce out of pro-only tabs
    if (newRole === "farmer" && !FARMER_TABS.includes(activeTab)) {
      handleTabChange("overview");
    }
    toast.success(t("role_switched_toast", { role: t(ROLE_CONFIGS[newRole]?.labelKey || newRole) }));
  };

  // Handle Theme Change
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("agri_guard_theme", newTheme);
    toast.success(t("theme_switched_toast", { theme: t(`theme_${newTheme === "high-contrast" ? "high_contrast" : newTheme}`) }));
  };

  // Keyboard Shortcut: Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync tab with URL
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  const fetchInitialData = useCallback(async () => {
    // Track per-endpoint failures so a fully-offline session falls back to the
    // last synced snapshot instead of silently showing empty dashboards.
    let failures = 0;
    const track = (p) => p.catch(() => { failures += 1; return { data: [] }; });
    try {
      const [farmsRes, claimsRes, alertsRes] = await Promise.all([
        track(axios.get(`${API_BASE_URL}/farms/`)),
        track(axios.get(`${API_BASE_URL}/claims/`)),
        track(axios.get(`${API_BASE_URL}/alerts/`)),
      ]);

      if (failures === 3) {
        throw new Error("network unreachable");
      }

      const rawFarms = Array.isArray(farmsRes.data) ? farmsRes.data : farmsRes.data?.results || [];
      const rawClaims = Array.isArray(claimsRes.data) ? claimsRes.data : claimsRes.data?.results || [];
      const rawAlerts = Array.isArray(alertsRes.data) ? alertsRes.data : alertsRes.data?.results || [];

      setFarms(rawFarms);
      setClaims(rawClaims);
      setAlerts(rawAlerts);
      setUnreadCount(rawAlerts.filter((a) => ["DISASTER", "WARNING"].includes(String(a.status || "").toUpperCase())).length);
      setUsingCachedData(false);

      if (rawClaims.length > 0 && !selectedClaimNo) {
        setSelectedClaimNo(rawClaims[0].claim_no);
      }

      // Snapshot for offline use
      const ts = new Date().toISOString();
      setLastSyncedAt(ts);
      try {
        localStorage.setItem("agri_guard_cache", JSON.stringify({ farms: rawFarms, claims: rawClaims, alerts: rawAlerts, ts }));
      } catch { /* storage full/blocked — non-fatal */ }
    } catch (err) {
      console.error("Failed to load initial data", err);
      // Offline fallback: restore the last synced snapshot
      try {
        const snap = JSON.parse(localStorage.getItem("agri_guard_cache") || "null");
        if (snap) {
          setFarms(snap.farms || []);
          setClaims(snap.claims || []);
          setAlerts(snap.alerts || []);
          setLastSyncedAt(snap.ts || null);
          setUsingCachedData(true);
          if (snap.claims?.length > 0 && !selectedClaimNo) {
            setSelectedClaimNo(snap.claims[0].claim_no);
          }
        }
      } catch { /* no snapshot available */ }
    }
  }, [selectedClaimNo]);

  // Ref used by the online/offline listener (avoids stale closures)
  const fetchInitialDataRef = useRef(fetchInitialData);
  fetchInitialDataRef.current = fetchInitialData;

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleNewAlert = useCallback((newAlert) => {
    setAlerts((prev) => [newAlert, ...prev]);
    setUnreadCount((prev) => prev + 1);
    toast(newAlert.message || t("new_alert_toast"), { icon: "⚠️" });
  }, [t]);

  useAlertsSocket(handleNewAlert);

  const handleSimulateDisaster = async () => {
    setIsSimulating(true);
    try {
      // Hit the real backend pipeline: spatial matching → alerts → claims →
      // claim timeline steps → (mock) payout/SMS → WebSocket broadcast.
      // Derive the event type from the latest alert so the demo scenario stays
      // consistent with what's on screen.
      const VALID_TYPES = ["FLOOD", "WILDFIRE", "DROUGHT"];
      const fromAlert = String(alerts[0]?.event_type || "").toUpperCase();
      const eventType = VALID_TYPES.includes(fromAlert) ? fromAlert : "FLOOD";
      await axios.post(`${API_BASE_URL}/events/simulate/`, { event_type: eventType });
      setIsDisasterActive(true);
      toast.success(t("map_disaster_active"));
      // Refresh lists immediately; the WebSocket NEW_ALERT push also arrives.
      fetchInitialData();
    } catch {
      // Offline / unauthenticated fallback: keep the front-end-only demo behavior
      await new Promise((r) => setTimeout(r, 1200));
      setIsDisasterActive(true);
      toast.success(t("map_disaster_active"));
    } finally {
      setIsSimulating(false);
    }
  };

  // Search Results Calculation
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const res = [];

    farms.forEach((f) => {
      const name = f.properties?.name || f.name || t("farm_number", { id: f.id });
      const crop = f.properties?.crop_type || f.crop_type || "";
      if (name.toLowerCase().includes(q) || crop.toLowerCase().includes(q)) {
        res.push({ type: "farm", title: name, subtitle: crop || t("overview_table_farm"), data: f });
      }
    });

    claims.forEach((c) => {
      if (c.claim_no?.toLowerCase().includes(q) || c.status?.toLowerCase().includes(q)) {
        res.push({ type: "claim", title: c.claim_no, subtitle: `${t("overview_table_status")}: ${c.status}`, data: c });
      }
    });

    alerts.forEach((a) => {
      if (a.event_type?.toLowerCase().includes(q) || a.status?.toLowerCase().includes(q)) {
        res.push({ type: "alert", title: `${a.event_type} (${a.status})`, subtitle: a.farm_name || t("farm_number", { id: a.farm }), data: a });
      }
    });

    return res.slice(0, 8);
  }, [searchQuery, farms, claims, alerts, t]);

  // Filter nav items based on role
  const filteredNavItems = useMemo(() => {
    if (isFarmer) {
      return NAV_ITEMS.filter((i) => FARMER_TABS.includes(i.id));
    }
    return NAV_ITEMS;
  }, [isFarmer]);

  const navItemVisual = (item) => ({
    Icon: isFarmer ? item.farmerIcon || item.icon : item.icon,
    label: t(isFarmer && item.farmerLabelKey ? item.farmerLabelKey : item.labelKey),
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-emerald-700 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-primary">AgriGuard</span>
              {!isFarmer && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">v2.4 Pro</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">{t("app_subtitle")}</p>
          </div>
        </div>

        {/* Search & Quick Command (pro roles only — farmers use bottom nav) */}
        {!isFarmer && (
          <div className="relative flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder={`${t("global_search_placeholder")} (Ctrl+K)`}
                className="w-full pl-9 pr-14 py-2 rounded-xl text-xs bg-muted/60 border border-border placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all text-foreground"
              />
              <button
                onClick={() => setIsCommandOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-card border border-border text-muted-foreground hover:text-foreground"
              >
                ⌘K
              </button>
            </div>

            {/* Search Dropdown */}
            {searchFocused && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card rounded-2xl shadow-xl border border-border p-2 z-50 animate-fade-in">
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-b border-border/40">
                  <span>{t("search_results_title")} ({searchResults.length})</span>
                  <button onClick={() => setSearchFocused(false)} className="hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="max-h-60 overflow-y-auto mt-1 space-y-1 scrollbar-thin">
                  {searchResults.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (item.type === "farm") handleTabChange("map");
                        if (item.type === "claim") { setSelectedClaimNo(item.data.claim_no); handleTabChange("timeline"); }
                        if (item.type === "alert") handleTabChange("map");
                        setSearchFocused(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-muted/60 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-foreground">{item.title}</div>
                        <div className="text-[10px] text-muted-foreground">{item.subtitle}</div>
                      </div>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground">{item.type}</span>
                    </button>
                  ))}
                  {searchResults.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t("no_search_results")}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right Tools & Role Picker */}
        <div className="flex items-center gap-2 sm:gap-3">
          <select
            value={userRole}
            onChange={(e) => handleRoleChange(e.target.value)}
            aria-label={t("switch_role")}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="insurer">{t("role_insurer")}</option>
            <option value="farmer">{t("role_farmer")}</option>
            <option value="regulator">{t("role_regulator")}</option>
          </select>

          {/* Notifications Popover */}
          <div className="relative">
            <button
              onClick={() => { setNotificationsOpen(!notificationsOpen); setUnreadCount(0); }}
              aria-label={t("system_alerts_title")}
              className="p-2 rounded-xl bg-muted/60 hover:bg-muted border border-border relative text-muted-foreground hover:text-foreground transition-all"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <>
                {/* click-outside backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card rounded-2xl shadow-xl border border-border p-3 z-50 animate-fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-bold text-foreground">{t("system_alerts_title")}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setUnreadCount(0); setNotificationsOpen(false); }}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      {t("mark_all_read")}
                    </button>
                    <button onClick={() => setNotificationsOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                  {alerts.slice(0, 5).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setNotificationsOpen(false); handleTabChange("map"); }}
                      className="w-full text-left p-2 rounded-xl bg-muted/40 hover:bg-muted/70 text-xs transition-colors flex items-start gap-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">{a.event_type} - {a.farm_name || t("farm_number", { id: a.farm })}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                    </button>
                  ))}
                  {alerts.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground">{t("no_alerts_matched")}</div>
                  )}
                </div>
                </div>
              </>
            )}
          </div>

          <LanguageSwitcher />
        </div>
      </header>

      {/* Offline banner — shown when offline or serving cached data */}
      {(isOffline || usingCachedData) && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{t("offline_banner")}</span>
          {lastSyncedAt && (
            <span className="font-mono font-semibold opacity-80">
              {t("offline_synced_at", { time: new Date(lastSyncedAt).toLocaleString() })}
            </span>
          )}
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Nav (desktop) */}
        <aside className="hidden md:block w-60 border-r border-border bg-card/60 p-4 space-y-1 shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 mb-2 font-mono">
            {t("navigation_title")}
          </div>
          {filteredNavItems.map((item) => {
            const { Icon, label } = navItemVisual(item);
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </aside>

        {/* Tab Content Body — extra bottom padding on mobile for the nav bar */}
        <main className="flex-1 p-4 lg:p-6 pb-24 md:pb-6 overflow-y-auto">
          {activeTab === "overview" && (
            isFarmer ? (
              <FarmerHome
                farms={farms}
                claims={claims}
                alerts={alerts}
                onNavigate={handleTabChange}
              />
            ) : (
              <DashboardOverview
                farms={farms}
                claims={claims}
                alerts={alerts}
                onNavigateClaims={(claimNo) => { setSelectedClaimNo(claimNo); handleTabChange("timeline"); }}
              />
            )
          )}

          {activeTab === "map" && (
            <MapView
              isDisasterActive={isDisasterActive}
              onSimulateDisaster={isFarmer ? undefined : handleSimulateDisaster}
              isSimulating={isSimulating}
              farms={farms}
              alerts={alerts}
            />
          )}

          {activeTab === "timeline" && (
            <ClaimTimeline claimNo={selectedClaimNo || claims[0]?.claim_no || "CLM-2026-0819-01"} />
          )}

          {activeTab === "reports" && (
            <ReportQueryPanel farms={farms} alerts={alerts} claims={claims} />
          )}

          {activeTab === "settings" && (
            <SettingsPanel farms={farms} onSaved={fetchInitialData} />
          )}

          {activeTab === "sms" && (
            <SmsMockup inline />
          )}
        </main>
      </div>

      {/* Mobile bottom navigation — thumb-reach, safe-area aware */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-md pb-safe">
        <div className="flex items-stretch justify-around">
          {filteredNavItems.map((item) => {
            const { Icon, label } = navItemVisual(item);
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "scale-110" : ""} transition-transform`} />
                <span className="leading-none">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global Command Palette (Ctrl + K) */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onNavigate={(tab) => handleTabChange(tab)}
        onRoleChange={handleRoleChange}
        currentRole={userRole}
        onThemeChange={handleThemeChange}
        currentTheme={theme}
      />
    </div>
  );
}
