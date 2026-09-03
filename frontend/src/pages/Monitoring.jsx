import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function Monitoring() {
  const [slos,       setSlos]       = useState([]);
  const [health,     setHealth]     = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [checking,   setChecking]   = useState(null);
  const [predicting, setPredicting] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const fetchSLOs = async () => {
    const [s, h] = await Promise.all([
      api.get('/monitoring/slos'),
      api.get('/monitoring/health'),
    ]);
    setSlos(s.data);
    setHealth(h.data);
  };

  useEffect(() => { fetchSLOs(); }, []);

  const checkNow = async (sloId) => {
    setChecking(sloId);
    try {
      const { data } = await api.post(`/monitoring/slos/${sloId}/check`);
      setSlos(prev => prev.map(s => s._id === sloId ? data.slo : s));
    } finally { setChecking(null); }
  };

  const predict = async (sloId) => {
    setPredicting(sloId);
    setPrediction(null);
    try {
      const { data } = await api.get(`/monitoring/slos/${sloId}/predict`);
      setPrediction({ sloId, ...data });
      setSelected(sloId);
    } catch (e) {
      alert(e.response?.data?.message || 'Prediction failed');
    } finally { setPredicting(null); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Monitoring</h1>
        <p className="text-sm text-gray-400 mt-0.5">SLO status and AI-powered breach prediction</p>
      </div>

      {/* System health */}
      {health && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(health.services).map(([name, svc]) => (
            <div key={name} className={`card border ${svc.status === 'healthy' ? 'border-green-800' : 'border-red-800'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${svc.status === 'healthy' ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
                <div>
                  <div className="font-medium text-sm text-white capitalize">{name}</div>
                  <StatusBadge status={svc.status} />
                </div>
                {svc.models && (
                  <div className="ml-auto text-xs text-gray-500">{svc.models.length} models</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLOs */}
      <div>
        <div className="text-sm font-semibold text-gray-300 mb-3">Service Level Objectives</div>
        <div className="space-y-3">
          {slos.map(slo => (
            <div key={slo._id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-white">{slo.metricName}</span>
                    <StatusBadge status={slo.status} />
                    {slo.service?.name && (
                      <span className="text-xs text-gray-500">· {slo.service.name}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    threshold: value {slo.comparator} {slo.threshold} {slo.unit}
                  </div>
                  {slo.lastValue != null && (
                    <div className={`text-xs mt-1 font-mono ${slo.status === 'violated' ? 'text-red-400' : 'text-green-400'}`}>
                      current: {slo.lastValue.toFixed(2)} {slo.unit}
                    </div>
                  )}
                  {slo.queryExpression && (
                    <div className="text-xs text-gray-600 font-mono mt-1 truncate">{slo.queryExpression}</div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => checkNow(slo._id)}
                    disabled={checking === slo._id}
                    className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <ArrowPathIcon className={`w-3 h-3 ${checking === slo._id ? 'animate-spin' : ''}`} />
                    Check
                  </button>
                  <button
                    onClick={() => predict(slo._id)}
                    disabled={predicting === slo._id}
                    className="flex items-center gap-1 bg-purple-900/50 hover:bg-purple-800/50 text-xs text-purple-300 border border-purple-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <SparklesIcon className="w-3 h-3" />
                    {predicting === slo._id ? 'Predicting…' : 'Predict Breach'}
                  </button>
                </div>
              </div>

              {/* Prediction panel */}
              {prediction?.sloId === slo._id && (
                <div className={`mt-3 rounded-lg p-3 border ${prediction.prediction.willBreach ? 'bg-red-900/20 border-red-800' : 'bg-green-900/20 border-green-800'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <SparklesIcon className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-purple-400">LLM Prediction Result</span>
                    <span className="text-xs text-gray-500">({prediction.dataPoints} data points)</span>
                  </div>
                  <div className={`text-sm font-medium ${prediction.prediction.willBreach ? 'text-red-400' : 'text-green-400'}`}>
                    {prediction.prediction.willBreach
                      ? `⚠ Breach predicted in ~${prediction.prediction.estimatedMinutesToBreach}min`
                      : '✓ No breach predicted'
                    }
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{prediction.prediction.trendDescription}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Confidence: {Math.round((prediction.prediction.confidence || 0) * 100)}%
                  </div>
                </div>
              )}
            </div>
          ))}
          {slos.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-8">
              No SLOs configured yet. Generate from requirements via AI → SLO.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
