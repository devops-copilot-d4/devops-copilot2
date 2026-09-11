import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import {
  PlusIcon,
  SparklesIcon,
  DocumentTextIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const EMPTY = { title: '', description: '', priority: 'medium', service: '' };

const PRIORITY_COLOR = {
  low:      'text-gray-400',
  medium:   'text-blue-400',
  high:     'text-orange-400',
  critical: 'text-red-400',
};

export default function Requirements() {
  const [requirements, setRequirements] = useState([]);
  const [services,     setServices]     = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [form,         setForm]         = useState(EMPTY);
  const [showForm,     setShowForm]     = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [genResult,    setGenResult]    = useState(null);
  const [filterSvc,    setFilterSvc]    = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading,      setLoading]      = useState(true);

  const fetchRequirements = async () => {
    try {
      const params = filterSvc ? `?serviceId=${filterSvc}` : '';
      const { data } = await api.get(`/requirements${params}`);
      setRequirements(data);
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    const { data } = await api.get('/services');
    setServices(data);
  };

  useEffect(() => { fetchServices(); }, []);
  useEffect(() => { fetchRequirements(); }, [filterSvc]); // eslint-disable-line

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/requirements', form);
      setForm(EMPTY);
      setShowForm(false);
      await fetchRequirements();
      setSelected(data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create requirement');
    } finally {
      setCreating(false);
    }
  };

  const generateSLO = async (req) => {
    setGenerating(true);
    setGenResult(null);
    try {
      const { data } = await api.post('/ai/slo/generate', { requirementId: req._id });
      setGenResult(data);
      // Refresh so the status badge updates to 'active'
      await fetchRequirements();
      // Update the selected panel with fresh data
      setSelected(prev => ({ ...prev, status: 'active' }));
    } catch (err) {
      alert(err.response?.data?.message || 'SLO generation failed — is Ollama running?');
    } finally {
      setGenerating(false);
    }
  };

  const filtered = requirements.filter(r =>
    filterStatus === 'all' ? true : r.status === filterStatus
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Requirements</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Define service requirements — AI converts them to SLOs automatically
          </p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          New Requirement
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterSvc}
          onChange={e => setFilterSvc(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-brand-500"
        >
          <option value="">All services</option>
          {services.map(s => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          {['all', 'pending', 'active', 'met', 'violated', 'deprecated'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card">
          <div className="text-sm font-semibold text-gray-300 mb-3">New Requirement</div>
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Requirement title *"
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
              <select
                value={form.service}
                onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand-500"
              >
                <option value="">Select service *</option>
                {services.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the requirement in plain English — e.g. 'The API must respond within 200ms for 99% of requests' *"
              required
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-brand-500"
                >
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-800 text-gray-400 text-sm px-4 py-2 rounded-lg hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-2">
          {loading && <div className="text-gray-500 text-sm">Loading…</div>}
          {filtered.map(req => (
            <div
              key={req._id}
              onClick={() => { setSelected(req); setGenResult(null); }}
              className={`card cursor-pointer hover:border-brand-600 transition-colors ${
                selected?._id === req._id ? 'border-brand-600' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-white line-clamp-1">{req.title}</span>
                </div>
                <StatusBadge status={req.status} />
              </div>
              <div className="text-xs text-gray-400 line-clamp-2 mb-2">{req.description}</div>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium capitalize ${PRIORITY_COLOR[req.priority]}`}>
                  {req.priority}
                </span>
                <div className="flex items-center gap-2">
                  {req.service?.name && (
                    <span className="text-xs text-gray-500 font-mono">{req.service.name}</span>
                  )}
                  <span className="text-xs text-gray-600">
                    {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-8">
              No requirements found
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="card space-y-4">
              {/* Title + status */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-lg leading-tight">{selected.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {selected.service?.name && (
                      <span className="font-mono">{selected.service.name} · </span>
                    )}
                    {selected.createdBy?.username && (
                      <span>by {selected.createdBy.username} · </span>
                    )}
                    {formatDistanceToNow(new Date(selected.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium capitalize ${PRIORITY_COLOR[selected.priority]}`}>
                    {selected.priority}
                  </span>
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {/* Description */}
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-400 mb-1.5">Requirement</div>
                <p className="text-sm text-gray-200 leading-relaxed">{selected.description}</p>
              </div>

              {/* Generate SLO button */}
              {selected.status === 'pending' && (
                <button
                  onClick={() => generateSLO(selected)}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <SparklesIcon className="w-4 h-4" />
                  {generating ? 'Generating SLO with AI…' : 'Generate SLO with AI'}
                </button>
              )}

              {/* Already has SLO */}
              {selected.status !== 'pending' && !genResult && (
                <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2">
                  <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                  SLO has been generated for this requirement. Check Monitoring to view it.
                </div>
              )}

              {/* SLO generation result */}
              {genResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2">
                    <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                    SLO generated successfully!
                  </div>

                  <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                    <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1.5">
                      <SparklesIcon className="w-3.5 h-3.5" />
                      AI-Generated SLO
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: 'Metric',     value: genResult.slo?.metricName },
                        { label: 'Comparator', value: genResult.slo?.comparator },
                        { label: 'Threshold',  value: `${genResult.slo?.threshold} ${genResult.slo?.unit || ''}` },
                        { label: 'Status',     value: <StatusBadge status={genResult.slo?.status || 'pending'} /> },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-900 rounded-lg p-2.5">
                          <div className="text-xs text-gray-500 mb-1">{label}</div>
                          <div className="text-xs font-mono text-gray-200">{value}</div>
                        </div>
                      ))}
                    </div>

                    {genResult.slo?.queryExpression && (
                      <div className="bg-gray-900 rounded-lg p-2.5">
                        <div className="text-xs text-gray-500 mb-1">PromQL Expression</div>
                        <code className="text-xs font-mono text-green-400 break-all">
                          {genResult.slo.queryExpression}
                        </code>
                      </div>
                    )}

                    {genResult.sloData?.reasoning && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">AI Reasoning</div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                          {genResult.sloData.reasoning}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Status',   value: <StatusBadge status={selected.status} /> },
                  { label: 'Priority', value: <span className={`text-sm font-medium capitalize ${PRIORITY_COLOR[selected.priority]}`}>{selected.priority}</span> },
                  { label: 'Service',  value: <span className="text-xs font-mono text-gray-300">{selected.service?.name || '—'}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-800 rounded-lg p-2.5">
                    <div className="text-xs text-gray-500 mb-1">{label}</div>
                    <div className="flex justify-center">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card h-full flex items-center justify-center text-gray-600 text-sm">
              Select a requirement to view details or generate an SLO
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
