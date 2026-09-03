import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { useSocket } from '../hooks/useSocket';
import { CheckCircleIcon, ArrowPathIcon, ClockIcon } from '@heroicons/react/24/outline';

export default function Recovery() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = async () => {
    try {
      const { data } = await api.get('/recovery?limit=50');
      setActions(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []);
  useSocket({ 'recovery:update': fetch_ });

  const approve = async (id) => {
    try {
      await api.patch(`/recovery/${id}/approve`);
      await fetch_();
    } catch (e) { alert(e.response?.data?.message || 'Approval failed'); }
  };

  const pendingApproval = actions.filter(a => a.status === 'pending_approval');
  const history         = actions.filter(a => a.status !== 'pending_approval');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Self-Healing Recovery</h1>
        <p className="text-sm text-gray-400 mt-0.5">Autonomous and human-approved recovery actions</p>
      </div>

      {/* Pending approvals */}
      {pendingApproval.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">Awaiting Approval ({pendingApproval.length})</span>
          </div>
          <div className="space-y-3">
            {pendingApproval.map(action => (
              <div key={action._id} className="card border-yellow-900/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white capitalize">{action.actionType.replace(/_/g,' ')}</span>
                      <span className="text-xs bg-yellow-900/50 text-yellow-400 border border-yellow-700 px-2 py-0.5 rounded-full">High Impact</span>
                    </div>
                    <div className="text-sm text-gray-400">{action.service?.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{action.reason}</div>
                  </div>
                  <button
                    onClick={() => approve(action._id)}
                    className="ml-4 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <div className="text-sm font-semibold text-gray-300 mb-3">Recovery History</div>
        {loading && <div className="text-gray-500 text-sm">Loading…</div>}
        <div className="space-y-2">
          {history.map(action => (
            <div key={action._id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowPathIcon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-medium text-sm text-white capitalize">{action.actionType.replace(/_/g,' ')}</span>
                    <StatusBadge status={action.status} />
                    {action.requirementVerified && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircleIcon className="w-3 h-3" /> SLO verified
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">{action.service?.name || '—'}</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{action.reason}</div>
                  {action.duration && (
                    <div className="text-xs text-gray-600 mt-1">{(action.duration / 1000).toFixed(1)}s execution</div>
                  )}
                </div>
                <div className="text-xs text-gray-500 whitespace-nowrap ml-4">
                  {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
          {!loading && history.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-8">No recovery actions yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
