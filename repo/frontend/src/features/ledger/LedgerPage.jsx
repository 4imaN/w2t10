import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export default function LedgerPage() {
  const { addToast } = useToastStore();
  const [entries, setEntries] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [reconciliation, setReconciliation] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [form, setForm] = useState({ amount: '', payment_method: 'cash', receipt_number: '', idempotency_key: '', ride_request: '' });
  const [tab, setTab] = useState('entries');

  useEffect(() => { loadEntries(); }, []);
  useEffect(() => { if (tab === 'reconciliation') loadReconciliation(); }, [selectedDate, tab]);

  async function loadEntries() {
    try {
      const res = await api.get('/ledger/entries?limit=50');
      setEntries(res.entries || []);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadReconciliation() {
    try {
      const res = await api.get(`/ledger/reconciliation/${selectedDate}`);
      setReconciliation(res.reconciliation);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const body = {
        ...form,
        amount: parseFloat(form.amount),
        idempotency_key: form.idempotency_key || `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      };
      const res = await api.post('/ledger/entries', body);
      if (res.message?.includes('Duplicate')) {
        addToast('Duplicate entry — existing record returned', 'warning');
      } else {
        addToast('Payment recorded', 'success');
      }
      setShowCreate(false);
      setForm({ amount: '', payment_method: 'cash', receipt_number: '', idempotency_key: '', ride_request: '' });
      loadEntries();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCloseDay() {
    try {
      await api.post(`/ledger/reconciliation/${selectedDate}/close`);
      addToast(`Day ${selectedDate} closed successfully`, 'success');
      loadReconciliation();
    } catch (err) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Funds Ledger</h1>
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Record Payment</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`btn-sm ${tab === 'entries' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('entries')}>Entries</button>
        <button className={`btn-sm ${tab === 'reconciliation' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('reconciliation')}>Reconciliation</button>
      </div>

      {tab === 'entries' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3">Receipt #</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Recorded By</th>
              <th className="text-left px-4 py-3">Locked</th>
            </tr></thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry._id} className="border-b">
                  <td className="px-4 py-3 font-mono text-xs">{entry.receipt_number}</td>
                  <td className="px-4 py-3 font-bold">{formatCurrency(entry.amount)}</td>
                  <td className="px-4 py-3 capitalize">{entry.payment_method?.replace('_', ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                  <td className="px-4 py-3">{entry.ledger_date}</td>
                  <td className="px-4 py-3">{entry.recorded_by?.display_name}</td>
                  <td className="px-4 py-3">{entry.day_closed ? '🔒' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {entries.length === 0 && <div className="p-8 text-center text-muted-foreground">No entries</div>}
        </div>
      )}

      {tab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" className="input w-full sm:w-48" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            {reconciliation && !reconciliation.locked && (
              <button className="btn-destructive btn-sm" onClick={handleCloseDay}>Close Day</button>
            )}
          </div>

          {reconciliation && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold">Reconciliation: {reconciliation.ledger_date}</h2>
                {reconciliation.locked && <span className="badge-destructive">🔒 Locked (Immutable)</span>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{formatCurrency(reconciliation.total_amount)}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(reconciliation.total_cash)}</div>
                  <div className="text-xs text-muted-foreground">Cash</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{formatCurrency(reconciliation.total_card)}</div>
                  <div className="text-xs text-muted-foreground">Card on File</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{reconciliation.entry_count}</div>
                  <div className="text-xs text-muted-foreground">Entries</div>
                </div>
              </div>
              {reconciliation.closed_by && (
                <div className="text-xs text-muted-foreground">
                  Closed by: {reconciliation.closed_by?.display_name || 'Unknown'} at {formatDateTime(reconciliation.closed_at)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Record Payment" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Amount *</label>
              <input type="number" step="0.01" min="0" className="input mt-1" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium">Payment Method</label>
              <select className="input mt-1" value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                <option value="cash">Cash</option>
                <option value="card_on_file">Card on File</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Receipt Number *</label>
            <input className="input mt-1" value={form.receipt_number}
              onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm font-medium">Idempotency Key</label>
            <input className="input mt-1" value={form.idempotency_key}
              onChange={e => setForm(f => ({ ...f, idempotency_key: e.target.value }))}
              placeholder="Auto-generated if empty" />
            <p className="text-xs text-muted-foreground mt-1">Prevents duplicate submissions</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Record Payment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
