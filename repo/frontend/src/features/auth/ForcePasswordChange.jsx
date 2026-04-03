import React, { useState } from 'react';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';

export default function ForcePasswordChange() {
  const { user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      // Clear the flag and reload
      useAuthStore.setState({ mustChangePassword: false });
    } catch (err) {
      setError(err.message || 'Failed to change password');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔐</div>
          <h1 className="text-xl font-bold">Password Change Required</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome, {user?.display_name || user?.username}. You must set a new password before continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Current Password</label>
            <input type="password" className="input" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">New Password (min 8 characters)</label>
            <input type="password" className="input" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Confirm New Password</label>
            <input type="password" className="input" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} required />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Changing...' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
