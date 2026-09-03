import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import RiskBadge from '../components/RiskBadge';
import { useSocket } from '../hooks/useSocket';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [rcaLoading, setRcaLoading] = useState(false);
  const [filter,    setFilter]    = useState('all');

  const fetchIncidents = async () => {
    try {
      const { data } = await api.get('/ai/incidents?limit=50');
      setIncidents(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchIncidents(); }, []);
  useSocket({ 'incident:new': fetchIncidents });

  const runRCA = async (deploymentId) => {
    setRcaLoading(true);
    try {
      await api.post('/ai/rca', { deploymentId });
      await fetchIncidents();
    } catch (e) {
      alert(e.response?.data?.message || 'RCA failed');
    } finally { setRcaLoading(false); }
  };

  const triggerRecovery = async (incidentId, actionType) => {
    try {
      await api.post('/recovery', { incidentId, actionType });
      await fetchIncidents();
    } catch (e) { alert(e.response?.data?.message || 'Recovery failed'); }
  };

  const filtered = filter === 'all'
    ? incidents
    : incidents.filter(i => i.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Incidents</h1>
          <p className="text-sm text-gray-400 mt-0.5">AI-detected failures and root cause analysis</p>
        </div>
        <div className="flex gap-2">
          {['all','open','diagnosing','recovering','resolved'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-2">
          {loading && <div className="text-gray-500 text-sm">Loading…</div>}
          {filtered.map(inc => (
            <div
              key={inc._id}
              onClick={() => setSelected(inc)}
              className={`card cursor-pointer hover:border-brand-600 transition-colors ${selected?._id === inc._id ? 'border-brand-600' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-2">
                  <StatusBadge status={inc.severity} />
                  <StatusBadge status={inc.status} />
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div className="text-sm font-medium text-white truncate">{inc.service?.name || '—'}</div>
              <div className="text-xs text-gray-400 mt-1 line-clamp-2">{inc.rootCause || 'No RCA yet'}</div>
              {inc.xgboostScore != null && (
                <div className="mt-2 flex items-center gap-2">
                  <SparklesIcon className="w-3 h-3 text-purple-400" />
                  <span className="text-xs text-purple-400">
                    XGBoost: {Math.round(inc.xgboostScore * 100)}% failure probability
                  </span>
                </div>
              )}
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-8">No incidents found</div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-white">{selected.service?.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 capitalize">{selected.type?.replace(/_/g,' ')}</div>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={selected.severity} />
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {/* RCA */}
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <SparklesIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-purple-400">LLM Root Cause Analysis</span>
                  {selected.confidence != null && (
                    <span className="text-xs text-gray-500">· {Math.round(selected.confidence * 100)}% confidence</span>
                  )}
                </div>
                <p className="text-sm text-gray-300">
                  {selected.rootCause || 'No RCA available. Run analysis to generate.'}
                </p>
                {selected.affectedComponent && (
                  <div className="mt-2 text-xs text-gray-500">
                    Affected: <span className="text-gray-300 font-mono">{selected.affectedComponent}</span>
                  </div>
                )}
              </div>

              {/* XGBoost */}
              {selected.xgboostScore != null && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs font-semibold text-yellow-400 mb-2">XGBoost Failure Prediction</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${selected.xgboostScore > 0.75 ? 'bg-red-500' : selected.xgboostScore > 0.5 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                        style={{ width: `${selected.xgboostScore * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-white">{Math.round(selected.xgboostScore * 100)}%</span>
                    <RiskBadge level={selected.xgboostScore > 0.75 ? 'critical' : selected.xgboostScore > 0.5 ? 'high' : 'medium'} />
                  </div>
                </div>
              )}

              {/* Recovery actions */}
              {selected.status !== 'resolved' && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 mb-2">Self-Healing Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    {['restart','rollback','scale_up','alert_only'].map(action => (
                      <button
                        key={action}
                        onClick={() => triggerRecovery(selected._id, action)}
                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-brand-600 text-sm text-gray-300 hover:text-white rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
                      >
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                        {action.replace(/_/g,' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw logs */}
              {selected.rawLogsSnapshot && (
                <details className="group">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                    View raw logs
                  </summary>
                  <pre className="mt-2 text-xs font-mono text-gray-400 bg-gray-950 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {selected.rawLogsSnapshot}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="card h-full flex items-center justify-center text-gray-600 text-sm">
              Select an incident to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
