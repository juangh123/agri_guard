import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertTriangle, FileText, Smartphone } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

export default function ClaimTimeline({ claimNo }) {
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Default steps logic combined with backend
  const stepConfigs = {
    'DETECTED': { id: 1, title: 'Satellite detected anomaly', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' },
    'VERIFIED': { id: 2, title: 'GNSS boundary verified', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100' },
    'TRIGGERED': { id: 3, title: 'Parametric trigger met & Claim created', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-100' },
    'NOTIFIED': { id: 4, title: 'SMS sent to farmer', icon: Smartphone, color: 'text-emerald-500', bg: 'bg-emerald-100' },
    'PENDING': { id: 5, title: 'Payout pending', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100' },
    'PAID': { id: 5, title: 'Payout complete', icon: CheckCircle2, color: 'text-amber-500', bg: 'bg-amber-100' },
    'REJECTED': { id: 5, title: 'Claim Rejected', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100' }
  };

  useEffect(() => {
    if (!claimNo) return;

    const fetchTimeline = async () => {
      setLoading(true);
      try {
        // ClaimViewSet.lookup_field = 'claim_no'; relative URL, auth header added by App.jsx axios interceptor
        const response = await axios.get(`${API_BASE_URL}/claims/${claimNo}/timeline/`);
        setTimelineEvents(response.data);
        setError(null);
      } catch (err) {
        console.error("Error fetching claim timeline:", err);
        setError("Failed to load timeline");
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();

    // Dashboard now refreshes event-driven via WebSocket (useAlertsSocket: on NEW_ALERT
    // it re-pulls claims/alerts), so the old 5s demo polling is downgraded to a 30s
    // fallback in case the socket is disconnected (hook reconnects with backoff).
    const interval = setInterval(fetchTimeline, 30000);

    return () => clearInterval(interval);
  }, [claimNo]);

  if (loading && timelineEvents.length === 0) return <div className="p-4 text-sm text-gray-500">Loading timeline...</div>;
  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>;
  if (!claimNo) return <div className="p-4 text-sm text-gray-500">Select a claim to view timeline.</div>;

  return (
    <div className="glass-panel p-6 rounded-2xl shadow-lg border border-white/60">
      <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Clock className="h-5 w-5 text-green-600" />
        Zero-Touch Claim Process
      </h3>
      <div className="relative">
        {/* Vertical Line */}
        <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-gray-200 z-0"></div>
        
        <div className="space-y-6 relative z-10">
          {timelineEvents.map((event, index) => {
            const config = stepConfigs[event.status] || { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100', title: event.status };
            const Icon = config.icon;
            const isLast = index === timelineEvents.length - 1;
            
            return (
              <div key={event.id} className={`flex gap-4 transition-all duration-500 opacity-100`}>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${config.bg} ${isLast ? 'ring-4 ring-green-100 animate-pulse' : ''} transition-colors duration-500`}>
                  <Icon className={`h-6 w-6 ${config.color}`} />
                </div>
                <div className="pt-2">
                  <h4 className={`text-sm font-bold text-gray-900`}>{config.title}</h4>
                  <p className="text-xs text-gray-500 mt-1">{event.detail}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(event.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
