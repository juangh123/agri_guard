import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Menu, Map as MapIcon, BarChart3, Settings, LogOut, Search, Bell, Droplets, CheckCircle2, List } from 'lucide-react';
import DashboardOverview from '../components/DashboardOverview';
import MapView from '../components/MapView';
import ClaimTimeline from '../components/ClaimTimeline';
import SmsMockup from '../components/SmsMockup';
import LanguageSwitcher from '../components/LanguageSwitcher';
import useAlertsSocket from '../hooks/useAlertsSocket';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [userName, setUserName] = useState('');
  const [activeTab, setActiveTab] = useState('map'); // Map-first design
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Real Data states
  const [farms, setFarms] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [claims, setClaims] = useState([]);
  const [activeClaimNo, setActiveClaimNo] = useState(null);
  const [eventTypes, setEventTypes] = useState({}); // event id -> event_type lookup
  
  // Demo states
  const [isDisasterActive, setIsDisasterActive] = useState(false);
  const [isSmsVisible, setIsSmsVisible] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [role, setRole] = useState('insurance'); // 'farmer' or 'insurance'

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };
      
      const [farmsRes, alertsRes, claimsRes, eventsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/farms/`, { headers }),
        axios.get(`${API_BASE_URL}/alerts/`, { headers }),
        axios.get(`${API_BASE_URL}/claims/`, { headers }),
        axios.get(`${API_BASE_URL}/events/`, { headers })
      ]);
      
      // /api/farms/ returns a GeoJSON FeatureCollection; farm fields live on feature.properties
      setFarms(farmsRes.data.features || []);
      setAlerts(alertsRes.data);
      setClaims(claimsRes.data);

      // RiskAlert has no disaster_type field; the type lives on the linked event.
      // Build an event id -> event_type map from the events GeoJSON FeatureCollection.
      const typeMap = {};
      (eventsRes.data.features || []).forEach((f) => {
        typeMap[f.id] = f.properties?.event_type;
      });
      setEventTypes(typeMap);
      
      if (claimsRes.data.length > 0) {
          setActiveClaimNo(claimsRes.data[0].claim_no);
      }

      // Auto-activate disaster UI if pending alerts exist
      if (alertsRes.data.length > 0) {
        setIsDisasterActive(true);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error(t('dashboard_load_failed', { defaultValue: 'Unable to load dashboard data.' }));
    }
  }, [t]);

  // Real-time alerts via WebSocket (backend: core/consumers.py, group 'alerts_group').
  // The hook keeps the latest handler via a ref, so this closure is never stale.
  useAlertsSocket({
    onNewAlert: (data) => {
      if (!data) return;
      // Optimistically prepend the pushed alert (dedup by id). The payload only
      // carries { id, farm_name, event_title, status, confidence }; fetchData()
      // below replaces it with the canonical REST shape (with farm/event ids).
      setAlerts((prev) => [data, ...prev.filter((a) => a.id !== data.id)]);
      setIsDisasterActive(true);
      toast(t('new_alert_toast', { farm: data.farm_name, event: data.event_title }), { icon: '🚨' });
      // Event-driven refresh: re-pull alerts & claims so the claims table and
      // ClaimTimeline reflect the newly generated claim without waiting for polling.
      fetchData();
    },
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    } else {
      const storedName = localStorage.getItem('userName') || 'Admin User';
      setUserName(storedName);
      fetchData();
    }
  }, [navigate, fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('userName');
    navigate('/login');
  };

  const handleSimulateDisaster = async () => {
    if (isDisasterActive) {
      // Reset
      setIsDisasterActive(false);
      setIsSmsVisible(false);
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    setIsSimulating(true);
    try {
      await axios.post(
        `${API_BASE_URL}/events/simulate/`,
        { event_type: 'FLOOD', farm_id: farms[0]?.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsDisasterActive(true);
      toast.success(t('disaster_simulated', { defaultValue: 'Disaster pipeline executed.' }));
      await fetchData();

      setTimeout(() => {
        setIsSmsVisible(true);
      }, 8000); // Demo delay for SMS visibility
    } catch (error) {
      console.error('Failed to simulate disaster:', error);
      toast.error(t('disaster_simulate_failed', { defaultValue: 'Failed to run disaster simulation.' }));
    } finally {
      setIsSimulating(false);
    }
  };

  const latestAlert = alerts[0] || null;
  const alertEventType = latestAlert?.event_type || eventTypes[latestAlert?.event] || 'Flood';
  const alertFarmName =
    latestAlert?.farm_name ||
    (latestAlert?.farm && farms.find(f => f.id === latestAlert.farm)?.properties?.name) ||
    'Mwangi Farm';

  const menuItems = [
    { id: 'map', icon: MapIcon, label: t('nav_live_map') },
    { id: 'overview', icon: BarChart3, label: t('analytics') },
    { id: 'claims', icon: List, label: t('nav_claims') },
    { id: 'settings', icon: Settings, label: t('nav_settings') }
  ];

  return (
    <div className="flex h-screen bg-[#f4f6f8] font-sans overflow-hidden relative">
      {/* Decorative ambient backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-200/30 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-200/30 blur-3xl pointer-events-none"></div>

      {/* Sidebar */}
      <aside className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 fixed md:relative z-40 w-72 h-full
        glass-panel border-r border-white/60 shadow-xl shadow-green-900/5
        transition-transform duration-300 flex flex-col backdrop-blur-xl bg-white/40
      `}>
        <div className="p-6 flex items-center gap-3 border-b border-white/60 relative z-10">
          <div className="h-10 w-10 p-2 bg-gradient-to-br from-green-400 to-green-600 rounded-xl shadow-lg shadow-green-500/30 flex items-center justify-center">
            <Droplets className="h-full w-full text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">AgriGuard</h1>
        </div>

        <div className="px-6 py-4 border-b border-white/60 relative z-10">
          <div className="flex bg-gray-200/50 p-1 rounded-xl shadow-inner">
            <button 
              onClick={() => setRole('farmer')} 
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${role === 'farmer' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t('role_farmer')}
            </button>
            <button 
              onClick={() => setRole('insurance')} 
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${role === 'insurance' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t('role_insurance')}
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto relative z-10">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold ${
                activeTab === item.id 
                  ? 'bg-white shadow-sm text-green-700 border border-white/60' 
                  : 'text-gray-600 hover:bg-white/40 hover:text-gray-900'
              }`}
            >
              <item.icon className={`h-5 w-5 ${activeTab === item.id ? 'text-green-600' : 'text-gray-400'}`} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/60 relative z-10">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/40 border border-white/60 shadow-sm mb-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold shadow-sm">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{t('role_account', { role: t(role === 'farmer' ? 'role_farmer' : 'role_insurance') })}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 font-semibold hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 z-10">
        
        {/* Header */}
        <header className="h-20 glass-panel border-b border-white/60 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 backdrop-blur-xl bg-white/40 relative z-20">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-gray-500 hover:bg-white/60 transition-colors border border-transparent hover:border-white/60"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h2 className="text-2xl font-extrabold text-gray-900 hidden sm:block">
              {menuItems.find(i => i.id === activeTab)?.label}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex relative">
              <Search className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder={t('search_placeholder')} 
                className="pl-10 pr-4 py-2 bg-white/50 border border-white/60 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 shadow-sm w-64 transition-all"
              />
            </div>
            <LanguageSwitcher />
            <button className="relative p-2 rounded-full text-gray-500 hover:bg-white/60 transition-colors border border-transparent hover:border-white/60">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        {/* Main Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto relative z-10">
          {activeTab === 'overview' && <DashboardOverview />}
          
          {activeTab === 'claims' && (
            <div className="flex gap-6 h-full flex-col lg:flex-row">
                <div className="flex-1 glass-panel p-6 rounded-2xl shadow-lg border border-white/60">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">{t('recent_claims')}</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm whitespace-nowrap">
                            <thead className="uppercase tracking-wider border-b-2 border-gray-200">
                                <tr>
                                    <th scope="col" className="px-6 py-4">{t('th_claim_no')}</th>
                                    <th scope="col" className="px-6 py-4">{t('th_status')}</th>
                                    <th scope="col" className="px-6 py-4">{t('th_amount')}</th>
                                    <th scope="col" className="px-6 py-4">{t('th_date')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {claims.map((claim) => (
                                    <tr key={claim.id} className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer" onClick={() => setActiveClaimNo(claim.claim_no)}>
                                        <td className="px-6 py-4 text-blue-600 font-medium">{claim.claim_no}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${claim.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {claim.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">${claim.payout_amount}</td>
                                        <td className="px-6 py-4 text-gray-500">{new Date(claim.triggered_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                                {claims.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-4 text-center text-gray-500">{t('no_claims')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="lg:w-1/3 flex flex-col gap-6 overflow-y-auto">
                   <ClaimTimeline claimNo={activeClaimNo} />
                </div>
            </div>
          )}

          {activeTab === 'map' && (
            <div className="flex gap-6 h-full flex-col lg:flex-row">
              {/* Map Area */}
              <div className={`flex-1 transition-all duration-500 ${role === 'insurance' ? 'lg:w-2/3' : 'w-full'}`}>
                <MapView isDisasterActive={isDisasterActive} onSimulateDisaster={handleSimulateDisaster} isSimulating={isSimulating} farms={farms} />
              </div>
              
              {/* Right Panel for Insurance View */}
              {role === 'insurance' && (
                <div className="lg:w-1/3 flex flex-col gap-6 overflow-y-auto">
                   
                   {/* Alert Card */}
                   {isDisasterActive ? (
                     <div className="glass-panel p-6 rounded-2xl border border-red-200 bg-red-50/50 animate-slide-up shadow-lg">
                       <div className="flex items-center gap-3 text-red-600 mb-4">
                         <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]"></span>
                         <h3 className="font-extrabold text-xl tracking-tight">{t('high_risk')}: {alerts.length > 0 ? alertEventType : 'Flood'}</h3>
                       </div>
                       
                       <div className="bg-white/60 rounded-xl p-4 mb-4 border border-red-100">
                         <p className="text-gray-900 font-bold text-lg mb-1">{alerts.length > 0 ? alertFarmName : 'Mwangi Farm'}</p>
                         <p className="text-sm text-gray-600 flex items-center gap-1"><MapIcon className="h-3 w-3" /> {t('km_from_center', { dist: '1.2' })}</p>
                       </div>
                       
                       <div className="mb-5">
                         <div className="flex justify-between text-sm mb-1.5 font-semibold">
                           <span className="text-gray-600">{t('confidence_label')}</span>
                           <span className="text-red-600">{alerts.length > 0 ? Math.round(latestAlert?.confidence || 85) : 85}%</span>
                         </div>
                         <div className="w-full bg-red-100/50 rounded-full h-2.5 overflow-hidden">
                           <div className="bg-gradient-to-r from-red-400 to-red-600 h-full rounded-full transition-all duration-1000 ease-out" style={{width: `${alerts.length > 0 ? Math.round(latestAlert?.confidence || 85) : 85}%`}}></div>
                         </div>
                       </div>
                       
                       <div className="space-y-2 mb-6">
                         <p className="text-sm text-gray-700 bg-white/40 p-2 rounded-lg"><strong className="text-gray-900">{t('trigger_label')}</strong> Water level &gt; 95th percentile · 3 Days</p>
                         <p className="text-sm text-gray-700 bg-white/40 p-2 rounded-lg"><strong className="text-gray-900">{t('impact_label')}</strong> 4.2 Ha Maize Crop</p>
                       </div>
                       
                       <button className="w-full py-3 bg-white text-red-600 font-bold rounded-xl text-sm border border-red-200 shadow-sm hover:bg-red-50 hover:border-red-300 transition-all flex items-center justify-center gap-2">
                         <Search className="h-4 w-4" /> {t('view_full_report')}
                       </button>
                     </div>
                   ) : (
                     <div className="glass-panel p-8 rounded-2xl border border-white/60 text-center flex flex-col items-center justify-center h-48 bg-white/40">
                       <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-3">
                         <CheckCircle2 className="h-8 w-8" />
                       </div>
                       <h3 className="font-bold text-gray-900 text-lg mb-1">{t('system_normal')}</h3>
                       <p className="text-sm text-gray-500">{t('no_active_disasters')}</p>
                       <p className="text-xs text-gray-400 mt-4">{t('simulate_hint')}</p>
                     </div>
                   )}

                   {/* Claim Timeline */}
                   {isDisasterActive && activeClaimNo && (
                     <ClaimTimeline claimNo={activeClaimNo} />
                   )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Overlays */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-30 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Farmer View: Simulate SMS receiving */}
      {role === 'farmer' && (
        <SmsMockup isVisible={isSmsVisible} onClose={() => setIsSmsVisible(false)} />
      )}
    </div>
  );
};

export default Dashboard;
