import { useEffect, useState } from 'react';
import {
  RocketLaunchIcon, BugAntIcon, ArrowPathIcon,
  CheckCircleIcon, ExclamationTriangleIcon, CpuChipIcon,
} from '@heroicons/react/24/outline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import RiskBadge from '../components/RiskBadge';
import { useSocket } from '../hooks/useSocket';

export default function Dashboard() {
  const [deployments, setDeployments] = useState([]);
  const [incidents,   setIncidents]   = useState([]);
  const [recovery,    setRecovery]    = useState([]);
  const [health,      setHealth]      = useState(null);
  const [loading,     setLoading]     = useState(true);

  const fetchAll = async () => {
    try {
      const [dep, inc, rec, hlth] = await Promise.all([
        api.get('/deployments?limit=20'),
        api.get('/ai/incidents?limit=20'),
        api.get('/recovery?limit=10'),
        api.get('/monitoring/health'),
      ]);
      setDeployments(dep.data);
      setIncidents(inc.data);
      setRecovery(rec.data);
      setHealth(hlth.data);
    } catch { /* handle gracefully */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  useSocket({
    'deployment:update': (d) => setDeployments(p => p.map(x => x._id === d.deploymentId ? { ...x, ...d.deployment } : x)),
    'incident:new':      ()  => fetchAll(),
    'recovery:update':   ()  => fetchAll(),
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total      = deployments.length;
  const succeeded  = deployments.filter(d => d.buildStatus === 'success').length;
  const failed     = deployments.filter(d => d.buildStatus === 'failed').length;
  const openInc    = incidents.filter(i => i.status !== 'resolved').length;
  const successRate = total ? Math.round((succeeded / total) * 100) : 0;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const deployTrend = deployments
    .slice(0, 14)
    .reverse()
    .map(d => ({
      date:    new Date(d.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      success: d.buildStatus === 'success' ? 1 : 0,
      failed:  d.buildStatus === 'failed'  ? 1 : 0,
      score:   d.failureScore ? Math.round(d.failureScore * 100) : null,
    }));

  const statusPie = [
    { name: 'Success', value: succeeded, color: '#22c55e' },
    { name: 'Failed',  value: failed,    color: '#ef4444' },
    { name: 'Running', value: deployments.filter(d => d.deployStatus === 'running').length, color: '#3b82f6' },
  ].filter(s => s.value > 0);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Real-time CI/CD intelligence overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Deployments" value={total}        color="blue"   icon={RocketLaunchIcon} />
        <StatCard label="Success Rate"       value={`${successRate}%`} color="green"  icon={CheckCircleIcon} sub={`${succeeded} succeeded`} />
        <StatCard label="Open Incidents"     value={openInc}     color="red"    icon={BugAntIcon} />
        <StatCard label="Recoveries Run"     value={recovery.length} color="purple" icon={ArrowPathIcon} />
      </div>

      {/* System health */}
      {health && (
        <div className="card">
          <div className="text-sm font-semibold text-gray-300 mb-3">System Health</div>
          <div className="flex gap-6">
            {Object.entries(health.services).map(([name, svc]) => (
              <div key={name} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${svc.status === 'healthy' ? 'bg-green-400' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-400 capitalize">{name}</span>
                <StatusBadge status={svc.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Deployment trend */}
        <div className="card lg:col-span-2">
          <div className="text-sm font-semibold text-gray-300 mb-4">Deployment Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={deployTrend}>
              <defs>
                <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="success" stroke="#22c55e" fill="url(#gSuccess)" name="Success" />
              <Area type="monotone" dataKey="failed"  stroke="#ef4444" fill="url(#gFailed)"  name="Failed" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status pie */}
        <div className="card">
          <div className="text-sm font-semibold text-gray-300 mb-4">Status Breakdown</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {statusPie.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent deployments */}
      <div className="card">
        <div className="text-sm font-semibold text-gray-300 mb-3">Recent Deployments</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left pb-2 font-medium">Service</th>
                <th className="text-left pb-2 font-medium">Branch</th>
                <th className="text-left pb-2 font-medium">Build</th>
                <th className="text-left pb-2 font-medium">Deploy</th>
                <th className="text-left pb-2 font-medium">AI Risk</th>
                <th className="text-left pb-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {deployments.slice(0, 10).map(d => (
                <tr key={d._id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="py-2 font-medium text-white">{d.service?.name || '—'}</td>
                  <td className="py-2 text-gray-400 font-mono text-xs">{d.branch || 'main'}</td>
                  <td className="py-2"><StatusBadge status={d.buildStatus} /></td>
                  <td className="py-2"><StatusBadge status={d.deployStatus} /></td>
                  <td className="py-2">
                    {d.failureScore != null
                      ? <RiskBadge level={d.failureScore > 0.75 ? 'critical' : d.failureScore > 0.5 ? 'high' : d.failureScore > 0.25 ? 'medium' : 'low'} />
                      : <span className="text-gray-600 text-xs">—</span>
                    }
                  </td>
                  <td className="py-2 text-gray-500 text-xs">{formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open incidents */}
      {openInc > 0 && (
        <div className="card border-red-900/50">
          <div className="flex items-center gap-2 mb-3">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Open Incidents ({openInc})</span>
          </div>
          <div className="space-y-2">
            {incidents.filter(i => i.status !== 'resolved').slice(0, 5).map(inc => (
              <div key={inc._id} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                <StatusBadge status={inc.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{inc.rootCause || 'Investigating…'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{inc.service?.name} · {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}</div>
                </div>
                <StatusBadge status={inc.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
