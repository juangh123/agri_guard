import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { ShieldCheck, Clock, AlertTriangle, FileCheck, Activity } from 'lucide-react';
import ReportQueryPanel from './ReportQueryPanel';

const claimsData = [
  { month: 'Jan', claims: 120, payout: 45 },
  { month: 'Feb', claims: 80, payout: 30 },
  { month: 'Mar', claims: 250, payout: 110 }, // Rainy season spike
  { month: 'Apr', claims: 320, payout: 180 },
  { month: 'May', claims: 150, payout: 60 },
  { month: 'Jun', claims: 90, payout: 40 },
];

const anomalyData = [
  { day: '01', anomaly: 0.2, threshold: 1.5 },
  { day: '05', anomaly: 0.5, threshold: 1.5 },
  { day: '10', anomaly: 0.8, threshold: 1.5 },
  { day: '15', anomaly: 1.6, threshold: 1.5 }, // Trigger point
  { day: '20', anomaly: 2.1, threshold: 1.5 },
  { day: '25', anomaly: 1.8, threshold: 1.5 },
  { day: '30', anomaly: 0.9, threshold: 1.5 },
];

const sourceData = [
  { name: 'VIIRS (Thermal)', value: 45 },
  { name: 'GEOGLOWS (Water)', value: 35 },
  { name: 'GNSS (Boundary)', value: 15 },
  { name: 'IoT (On-site)', value: 5 },
];
const COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#F59E0B'];

export default function DashboardOverview({ farms = [], alerts = [], claims = [] }) {
  return (
    <div className="space-y-6">
      <ReportQueryPanel farms={farms} alerts={alerts} claims={claims} />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Active Policies" 
          value="12,450" 
          trend="+12% YTD"
          status="good"
          icon={<ShieldCheck className="h-6 w-6 text-green-500" />}
        />
        <MetricCard 
          title="Claims Auto-Paid" 
          value="$465k" 
          trend="320 claims"
          status="warning"
          icon={<FileCheck className="h-6 w-6 text-blue-500" />}
        />
        <MetricCard 
          title="Avg. Payout Time" 
          value="18h" 
          trend="-6h vs industry"
          status="good"
          icon={<Clock className="h-6 w-6 text-purple-500" />}
        />
        <MetricCard 
          title="High Risk Zones" 
          value="4" 
          trend="Flood alerts active"
          status="danger"
          icon={<AlertTriangle className="h-6 w-6 text-red-500" />}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart - Claims Volume */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 relative overflow-hidden group border border-white/60 shadow-lg">
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Monthly Claim Volume vs Payouts</h3>
              <p className="text-xs text-gray-500">Correlation between rainy season (Mar-Apr) and auto-triggered claims.</p>
            </div>
            <select className="bg-white/60 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm shadow-sm font-semibold">
              <option>2026 YTD</option>
              <option>2025</option>
            </select>
          </div>
          <div className="h-72 w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={claimsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.6} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12, fontWeight: 500}} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12, fontWeight: 500}} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12, fontWeight: 500}} />
                <Tooltip 
                  cursor={{fill: 'rgba(59, 130, 246, 0.05)'}}
                  contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }}
                  itemStyle={{ fontWeight: 600 }}
                  labelStyle={{ color: '#374151', fontWeight: 700, marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                <Bar yAxisId="left" dataKey="claims" name="Total Claims" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="right" dataKey="payout" name="Payout ($k)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - Data Sources */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col relative overflow-hidden group border border-white/60 shadow-lg">
          <h3 className="text-lg font-bold text-gray-800 mb-1 relative z-10">Verification Sources</h3>
          <p className="text-xs text-gray-500 mb-4 relative z-10">Data weighting for claim confidence</p>
          <div className="flex-1 w-full relative z-10 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  itemStyle={{ color: '#1f2937' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Custom Legend for Pie */}
          <div className="grid grid-cols-2 gap-2 mt-2 relative z-10">
            {sourceData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: COLORS[i]}}></span>
                {item.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden border border-white/60 shadow-lg">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Activity className="h-5 w-5 text-red-500" />
              Temperature Anomaly Index (Parametric Trigger)
            </h3>
            <p className="text-xs text-gray-500 mt-1">When anomaly &gt; 1.5 for 3 consecutive days, payouts are automatically triggered.</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-gray-500 bg-white/50 px-3 py-1.5 rounded-lg border border-gray-200">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500"></span> Threshold (1.5)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-orange-400 opacity-50"></span> Actual Anomaly
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={anomalyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAnomaly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.6}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.6} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12, fontWeight: 500}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12, fontWeight: 500}} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }}
                itemStyle={{ fontWeight: 600 }}
                labelStyle={{ color: '#374151', fontWeight: 700, marginBottom: '4px' }}
              />
              <Area type="monotone" dataKey="threshold" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" fill="none" name="Trigger Threshold" />
              <Area type="monotone" dataKey="anomaly" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorAnomaly)" name="Recorded Anomaly" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, trend, icon, status }) {
  const statusColors = {
    normal: 'text-gray-500 bg-gray-100 border-gray-200',
    good: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-blue-600 bg-blue-50 border-blue-200',
    danger: 'text-red-600 bg-red-50 border-red-200'
  };
  
  const trendColors = {
    normal: 'text-gray-500',
    good: 'text-green-600',
    warning: 'text-blue-600',
    danger: 'text-red-600'
  };

  return (
    <div className="glass-panel p-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 relative overflow-hidden group border border-white/60">
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-white/40 to-transparent rounded-full blur-2xl group-hover:bg-white/60 transition-all duration-500"></div>
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-700 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border uppercase tracking-wider ${statusColors[status]}`}>
          {status}
        </span>
      </div>
      <div className="relative z-10">
        <h4 className="text-gray-500 text-sm font-semibold mb-1">{title}</h4>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-gray-900 tracking-tight">{value}</span>
          <span className={`text-xs font-bold ${trendColors[status]}`}>{trend}</span>
        </div>
      </div>
    </div>
  );
}