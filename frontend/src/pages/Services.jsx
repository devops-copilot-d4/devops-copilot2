import { useEffect, useState } from 'react';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { PlusIcon, ServerStackIcon } from '@heroicons/react/24/outline';

const EMPTY = { name: '', repoUrl: '', namespace: 'default', deploymentName: '', imageName: '', description: '' };

export default function Services() {
  const [services, setServices] = useState([]);
  const [form,     setForm]     = useState(EMPTY);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [liveSvc,  setLiveSvc]  = useState(null);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);

  const fetch_ = async () => {
    const { data } = await api.get('/services');
    setServices(data);
  };

  const selectService = async (svc) => {
    setSelected(svc);
    setEditing(null);
    setLiveSvc(null);
    try {
      const { data } = await api.get(`/services/${svc._id}`);
      setLiveSvc(data.liveStatus);
    } catch { /* k8s offline */ }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(`/services/${editing._id}`, editing);
      setSelected(data);
      setEditing(null);
      await fetch_();
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  useEffect(() => { fetch_(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/services', form);
      setForm(EMPTY);
      setShowForm(false);
      await fetch_();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create service');
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Services</h1>
          <p className="text-sm text-gray-400 mt-0.5">Registered services and Kubernetes status</p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add Service
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="text-sm font-semibold text-gray-300 mb-3">New Service</div>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            {[
              { key: 'name',           placeholder: 'Service name',              required: true },
              { key: 'repoUrl',        placeholder: 'GitHub repo URL',           required: true },
              { key: 'namespace',      placeholder: 'K8s namespace (default)' },
              { key: 'deploymentName', placeholder: 'K8s deployment name' },
              { key: 'imageName',      placeholder: 'Docker image name:tag' },
              { key: 'description',    placeholder: 'Description (optional)' },
            ].map(({ key, placeholder, required }) => (
              <input
                key={key}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                required={required}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
            ))}
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={creating} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {creating ? 'Creating…' : 'Create Service'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-800 text-gray-400 text-sm px-4 py-2 rounded-lg hover:text-white">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {services.map(svc => (
            <div
              key={svc._id}
              onClick={() => selectService(svc)}
              className={`card cursor-pointer hover:border-brand-600 transition-colors ${selected?._id === svc._id ? 'border-brand-600' : ''}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ServerStackIcon className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-sm text-white">{svc.name}</span>
                </div>
                <StatusBadge status={svc.status} />
              </div>
              <div className="text-xs text-gray-500 font-mono truncate">{svc.repoUrl}</div>
              {svc.namespace && (
                <div className="text-xs text-gray-600 mt-1">ns: {svc.namespace}</div>
              )}
            </div>
          ))}
          {services.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-8">No services registered yet</div>
          )}
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <div className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-white text-lg">{selected.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{selected.repoUrl}</div>
                  {selected.description && <div className="text-sm text-gray-400 mt-1">{selected.description}</div>}
                </div>
                <button
                  onClick={() => setEditing({ ...selected })}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Edit
                </button>
              </div>

              {/* Edit form */}
              {editing && (
                <form onSubmit={saveEdit} className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold text-gray-300 mb-2">Edit Service</div>
                  {[
                    { key: 'name',           label: 'Service Name' },
                    { key: 'deploymentName', label: 'K8s Deployment Name' },
                    { key: 'imageName',      label: 'Docker Image (name:tag)' },
                    { key: 'namespace',      label: 'K8s Namespace' },
                    { key: 'description',    label: 'Description' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-400 block mb-1">{label}</label>
                      <input
                        value={editing[key] || ''}
                        onChange={e => setEditing(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="bg-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg hover:bg-gray-600">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Namespace',       value: selected.namespace },
                  { label: 'Deployment Name', value: selected.deploymentName || '—' },
                  { label: 'Image',           value: selected.imageName || '—' },
                  { label: 'Status',          value: <StatusBadge status={selected.status} /> },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">{label}</div>
                    <div className="font-mono text-xs text-gray-300">{value}</div>
                  </div>
                ))}
              </div>

              {liveSvc && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs font-semibold text-blue-400 mb-2">Live K8s Status</div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: 'Desired',   val: liveSvc.desired },
                      { label: 'Ready',     val: liveSvc.ready },
                      { label: 'Available', val: liveSvc.available },
                      { label: 'Health',    val: <StatusBadge status={liveSvc.overallHealth} /> },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div className="text-base font-bold text-white">{val}</div>
                        <div className="text-xs text-gray-500">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card h-full flex items-center justify-center text-gray-600 text-sm">
              Select a service to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
