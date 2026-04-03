import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';

const CATEGORIES = ['statuses', 'tags', 'priority', 'thresholds', 'general', 'vehicle_types', 'ratings', 'sensitive_words'];

export default function ConfigPage() {
  const { addToast } = useToastStore();
  const [configs, setConfigs] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [form, setForm] = useState({ key: '', value: '', category: 'general', description: '' });
  const [editValue, setEditValue] = useState('');

  useEffect(() => { loadConfigs(); }, [activeCategory]);

  async function loadConfigs() {
    try {
      const params = activeCategory ? `?category=${activeCategory}` : '';
      const res = await api.get(`/config${params}`);
      setConfigs(res.configs || []);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      let value = form.value;
      try { value = JSON.parse(value); } catch {}
      await api.post('/config', { ...form, value });
      addToast('Config saved', 'success');
      setShowCreate(false);
      setForm({ key: '', value: '', category: 'general', description: '' });
      loadConfigs();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleInlineUpdate(key) {
    try {
      let value = editValue;
      try { value = JSON.parse(value); } catch {}
      await api.put(`/config/${key}`, { value });
      addToast(`Updated ${key}`, 'success');
      setEditKey(null);
      loadConfigs();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleDelete(key) {
    try {
      await api.delete(`/config/${key}`);
      addToast(`Deleted ${key}`, 'success');
      loadConfigs();
    } catch (err) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Config Center</h1>
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Add Config</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className={`btn-sm ${!activeCategory ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveCategory('')}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} className={`btn-sm ${activeCategory === c ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveCategory(c)}>{c}</button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[650px]">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3">Key</th>
            <th className="text-left px-4 py-3">Value</th>
            <th className="text-left px-4 py-3">Category</th>
            <th className="text-left px-4 py-3">Description</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {configs.map(c => (
              <tr key={c._id} className="border-b">
                <td className="px-4 py-3 font-mono text-xs">{c.key}</td>
                <td className="px-4 py-3">
                  {editKey === c.key ? (
                    <div className="flex gap-1">
                      <input className="input text-xs flex-1" value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleInlineUpdate(c.key)} />
                      <button className="btn-sm btn-primary" onClick={() => handleInlineUpdate(c.key)}>Save</button>
                      <button className="btn-sm btn-outline" onClick={() => setEditKey(null)}>✕</button>
                    </div>
                  ) : (
                    <span className="font-mono text-xs cursor-pointer hover:text-accent"
                      onClick={() => { setEditKey(c.key); setEditValue(JSON.stringify(c.value)); }}>
                      {JSON.stringify(c.value)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3"><span className="badge-muted">{c.category}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{c.description}</td>
                <td className="px-4 py-3">
                  <button className="btn-sm btn-destructive" onClick={() => handleDelete(c.key)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {configs.length === 0 && <div className="p-8 text-center text-muted-foreground">No configs found</div>}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Config" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="text-sm font-medium">Key *</label>
            <input className="input mt-1" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} required /></div>
          <div><label className="text-sm font-medium">Value * (JSON for arrays/objects)</label>
            <textarea className="input mt-1 h-24 font-mono" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} required /></div>
          <div><label className="text-sm font-medium">Category</label>
            <select className="input mt-1" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div><label className="text-sm font-medium">Description</label>
            <input className="input mt-1" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
