import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/constants';

export default function UsersPage() {
  const { addToast } = useToastStore();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'regular_user', display_name: '', phone: '' });

  useEffect(() => { loadUsers(); }, [page]);

  async function loadUsers() {
    try {
      const res = await api.get(`/users?page=${page}&limit=20`);
      setUsers(res.users || []);
      setPages(res.pages || 1);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post('/users', form);
      addToast('User created', 'success');
      setShowCreate(false);
      setForm({ username: '', password: '', role: 'regular_user', display_name: '', phone: '' });
      loadUsers();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    try {
      const updates = {};
      if (form.role) updates.role = form.role;
      if (form.display_name) updates.display_name = form.display_name;
      if (form.phone) updates.phone = form.phone;
      if (form.status) updates.status = form.status;
      if (form.password) updates.password = form.password;
      await api.put(`/users/${showEdit._id}`, updates);
      addToast('User updated', 'success');
      setShowEdit(null);
      loadUsers();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/users/${id}`);
      addToast('User deleted', 'success');
      loadUsers();
    } catch (err) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">User Management</h1>
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create User</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[650px]">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3">Username</th>
            <th className="text-left px-4 py-3">Display Name</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-left px-4 py-3">Phone</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-mono">{u.username}</td>
                <td className="px-4 py-3">{u.display_name}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{u.phone || '—'}</td>
                <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="btn-sm btn-outline" onClick={() => { setShowEdit(u); setForm({ role: u.role, display_name: u.display_name, phone: '', status: u.status, password: '' }); }}>Edit</button>
                    <button className="btn-sm btn-destructive" onClick={() => handleDelete(u._id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create User" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="text-sm font-medium">Username *</label>
            <input className="input mt-1" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required minLength={3} /></div>
          <div><label className="text-sm font-medium">Password *</label>
            <input type="password" className="input mt-1" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} /></div>
          <div><label className="text-sm font-medium">Role</label>
            <select className="input mt-1" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="text-sm font-medium">Display Name</label>
            <input className="input mt-1" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} /></div>
          <div><label className="text-sm font-medium">Phone</label>
            <input className="input mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit: ${showEdit?.username}`} size="md">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div><label className="text-sm font-medium">Role</label>
            <select className="input mt-1" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="text-sm font-medium">Display Name</label>
            <input className="input mt-1" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} /></div>
          <div><label className="text-sm font-medium">Phone</label>
            <input className="input mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Enter new phone to replace, or leave blank to keep" />
            <p className="text-xs text-muted-foreground mt-1">Current phone is masked. Enter a full new number to replace, or leave blank to keep unchanged.</p></div>
          <div><label className="text-sm font-medium">Status</label>
            <select className="input mt-1" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select></div>
          <div><label className="text-sm font-medium">New Password (optional)</label>
            <input type="password" className="input mt-1" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowEdit(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Update</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
