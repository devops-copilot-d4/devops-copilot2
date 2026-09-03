import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import RiskBadge from '../components/RiskBadge';
import { useSocket } from '../hooks/useSocket';
import { RocketLaunchIcon, SparklesIcon } from '@heroicons/react/24/outline';

export default function Deployments() {
  const [deployments, setDeployments] = useState([]);
  const [services,    setServices]    = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [liveStatus,  setLiveStatus]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [form,        setForm]        = useState({ serviceId: '', commitSha: '', commitMessage: '', branch: 'main' });
  const [triggering,  setTriggering]  = useState(false);

  const fetchData = async () => {
    try {
      const [dep, svc] = await Promise.all([
        api.get('/deployments?limit=30'),
        api.get('/services'),
      ]);
      setDeployments(dep.data);
      setServices(svc.data);
    } finally { setLoading(false); }
  };

  const selectDeployment = async (dep) => {
    setSelected(dep);
    setLiveStatus(null);
    try {
      const { data } = await api.get(`/deployments/${dep._id}`);
      setLiveStatus(data.liveStatus);
    } catch { /* k8s may be offline */ }
  };

  useEffect(() => { fetchData(); }, []);

  useSocket({
    'deployment:update': (data) => {
      setDeployments(prev =>
        prev.map(d => d._id === data.deploymentId ? { ...d, ...data.deployment } : d)
      );
      if (selected?._id === data.deploymentId) {
        setSelected(prev => ({ ...prev, ...data.deployment }));
      }
    },
  });

  const trigger = async (e) => {
    e.preventDefault();
    setTriggering(true);
    try {
      await api.post('/deployments', form);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Deploy failed');
    } finally { setTriggering(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Deployments</h1>
          <p className="text-sm text-gray-400 mt-0.5">Trigger deployments and track live status</p>
        </div>
      </div>

      {/* Trigger form */}
      <div className="card">
        <div className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <RocketLaunchIcon className="w-4 h-4 text-brand-500" />
          Trigger New Deployment
        </div>
        <form onSubmit={trigger} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={form.serviceId}
            onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            required
          >
            <option value="">Select service…</option>
            {services.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <input
            value={form.branch}
            onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
            placeholder="Branch (main)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
          />
          <input
            value={form.commitSha}
            onChange={e => setForm(f => ({ ...f, commitSha: e.target.value }))}
            placeholder="Commit SHA (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={triggering}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {triggering ? 'Triggering…' : 'Deploy'}
          </button>
        </form>
      </div>

      {/* List + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {loading && <div className="text-gray-500 text-sm">Loading…</div>}
          {deployments.map(dep => (
            <div
              key={dep._id}
              onClick={() => selectDeployment(dep)}
              className={`card cursor-pointer hover:border-brand-600 transition-colors ${selected?._id === dep._id ? 'border-brand-600' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-white">{dep.service?.name || '—'}</span>
                <span className="text-xs text-gray-500 font-mono">{dep.branch}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={dep.buildStatus} />
                <StatusBadge status={dep.deployStatus} />
                {dep.failureScore != null && (
                  <span className="flex items-center gap-1 text-xs text-purple-400">
                    <SparklesIcon className="w-3 h-3" />
                    {Math.round(dep.failureScore * 100)}%
                  </span>
                )}
              </div>
              {dep.commitSha && (
                <div className="text-xs text-gray-600 font-mono mt-1 truncate">{dep.commitSha.slice(0,12)}</div>
              )}
              <div className="text-xs text-gray-600 mt-1">
                {formatDistanceToNow(new Date(dep.createdAt), { addSuffix: true })}
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <div className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-white">{selected.service?.name}</div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{selected.commitSha || 'No SHA'}</div>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={selected.buildStatus} />
                  <StatusBadge status={selected.deployStatus} />
                </div>
              </div>

              {selected.failureScore != null && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <SparklesIcon className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-purple-400">AI Failure Prediction</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${selected.failureScore > 0.75 ? 'bg-red-500' : selected.failureScore > 0.5 ? 'bg-orange-500' : 'bg-green-500'}`}
                        style={{ width: `${selected.failureScore * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-white">{Math.round(selected.failureScore * 100)}%</span>
                  </div>
                </div>
              )}

              {liveStatus && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs font-semibold text-blue-400 mb-2">Live Kubernetes Status</div>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {[
                      { label: 'Desired',   value: liveStatus.desired },
                      { label: 'Ready',     value: liveStatus.ready },
                      { label: 'Available', value: liveStatus.available },
                      { label: 'Health',    value: <StatusBadge status={liveStatus.overallHealth} /> },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <div className="text-lg font-bold text-white">{value}</div>
                        <div className="text-xs text-gray-500">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {liveStatus.pods?.map(pod => (
                      <div key={pod.name} className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${pod.ready ? 'bg-green-400' : 'bg-red-500'}`} />
                        <span className="font-mono text-gray-400 truncate flex-1">{pod.name}</span>
                        <span className="text-gray-500">{pod.phase}</span>
                        {pod.restarts > 0 && <span className="text-orange-400">↺{pod.restarts}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.logs && (
                <details>
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Build logs</summary>
                  <pre className="mt-2 text-xs font-mono text-gray-400 bg-gray-950 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {selected.logs}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="card h-full flex items-center justify-center text-gray-600 text-sm">
              Select a deployment to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
