import { useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../api/client';
import {
  MagnifyingGlassIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

// Preset PromQL queries
const PRESETS = [
  { label: 'CPU Usage',         query: '100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)' },
  { label: 'Memory Usage %',    query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100' },
  { label: 'HTTP Request Rate', query: 'rate(http_requests_total[5m])' },
  { label: 'HTTP Error Rate',   query: 'rate(http_requests_total{status=~"5.."}[5m])' },
  { label: 'HTTP P99 Latency',  query: 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))' },
  { label: 'Up targets',        query: 'up' },
];

const RANGES = [
  { label: '15 min', seconds: 900,   step: '15s'  },
  { label: '1 hr',   seconds: 3600,  step: '60s'  },
  { label: '6 hr',   seconds: 21600, step: '300s' },
  { label: '24 hr',  seconds: 86400, step: '1200s' },
];

const formatTime = (ts) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Metrics() {
  const [query,     setQuery]     = useState('');
  const [rangeIdx,  setRangeIdx]  = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [results,   setResults]   = useState([]);   // [{metric, chartData}]
  const [instant,   setInstant]   = useState(null); // instant query result

  const runRangeQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setInstant(null);
    setResults([]);
    try {
      const range = RANGES[rangeIdx];
      const end   = Math.floor(Date.now() / 1000);
      const start = end - range.seconds;

      const { data } = await api.get('/monitoring/metrics/range', {
        params: { query: query.trim(), start, end, step: range.step },
      });

      // Transform each series into recharts-friendly data
      const series = (data.result || []).map((r) => {
        const label = Object.entries(r.metric || {})
          .filter(([k]) => k !== '__name__')
          .map(([k, v]) => `${k}="${v}"`)
          .join(', ') || r.metric?.__name__ || 'value';

        const chartData = (r.values || []).map(([ts, val]) => ({
          ts,
          time:  formatTime(ts),
          value: parseFloat(val),
        }));

        return { label, chartData };
      });

      setResults(series);
      if (series.length === 0) setError('Query returned no data.');
    } catch (err) {
      setError(err.response?.data?.message || 'Query failed — is Prometheus running?');
    } finally {
      setLoading(false);
    }
  };

  const runInstantQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);
    setInstant(null);
    try {
      const { data } = await api.get('/monitoring/metrics', {
        params: { query: query.trim() },
      });
      setInstant(data.result || []);
      if (!data.result?.length) setError('Query returned no data.');
    } catch (err) {
      setError(err.response?.data?.message || 'Query failed — is Prometheus running?');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runRangeQuery();
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Metrics Explorer</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Run PromQL queries against Prometheus and visualise results
        </p>
      </div>

      {/* Query bar */}
      <div className="card space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Enter PromQL query…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          {/* Range selector */}
          <div className="flex border border-gray-700 rounded-lg overflow-hidden">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  rangeIdx === i
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={runRangeQuery}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <ChartBarIcon className="w-4 h-4" />
            {loading ? 'Running…' : 'Graph'}
          </button>
          <button
            onClick={runInstantQuery}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <ClockIcon className="w-4 h-4" />
            Instant
          </button>
        </div>

        {/* Preset queries */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Presets:</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setQuery(p.query)}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 hover:text-white rounded-md transition-colors font-mono"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Range chart results */}
      {results.map((series, idx) => (
        <div key={idx} className="card">
          <div className="text-xs font-mono text-gray-400 mb-3 truncate" title={series.label}>
            {series.label}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={series.chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f9fafb',
                  fontSize: '12px',
                }}
                formatter={(v) => [typeof v === 'number' ? v.toFixed(4) : v, 'value']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                fill={`url(#grad-${idx})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#818cf8' }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-600 mt-1 px-1">
            <span>{series.chartData.length} data points</span>
            {series.chartData.length > 0 && (
              <span>
                min {Math.min(...series.chartData.map(d => d.value)).toFixed(3)}
                {' · '}
                max {Math.max(...series.chartData.map(d => d.value)).toFixed(3)}
                {' · '}
                avg {(series.chartData.reduce((s, d) => s + d.value, 0) / series.chartData.length).toFixed(3)}
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Instant query result table */}
      {instant && instant.length > 0 && (
        <div className="card">
          <div className="text-xs font-semibold text-gray-400 mb-3">Instant Query Results</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 font-medium pb-2 pr-4">Labels</th>
                  <th className="text-right text-gray-500 font-medium pb-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {instant.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 last:border-0">
                    <td className="py-2 pr-4 font-mono text-gray-300">
                      {Object.entries(r.metric || {})
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(', ') || '{}'}
                    </td>
                    <td className="py-2 text-right font-mono text-green-400">
                      {parseFloat(r.value?.[1]).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && !instant && !error && (
        <div className="card text-center py-12 text-gray-600 text-sm">
          Enter a PromQL query above or pick a preset to start exploring metrics
        </div>
      )}
    </div>
  );
}
