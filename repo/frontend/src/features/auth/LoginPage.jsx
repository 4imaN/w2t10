import React, { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

const PORTALS = {
  admin: {
    role: 'administrator',
    title: 'Admin Control Center',
    subtitle: 'System Administration Portal',
    icon: '🛡',
    gradient: 'from-gray-950 via-red-950 to-gray-950',
    cardBg: 'bg-gray-900 border-red-800/30',
    accentBtn: 'bg-red-600 hover:bg-red-700',
    accentText: 'text-red-400',
    accentRing: 'focus-visible:ring-red-500',
    inputBorder: 'border-red-900/50 bg-gray-800/80 text-gray-100 placeholder:text-gray-500',
    hint: 'Use credentials from the bootstrap credentials file.',
    description: 'Full system access. Manage users, settings, and all operations.',
    decorPattern: 'radial-gradient(circle at 20% 80%, rgba(220,38,38,0.08) 0%, transparent 50%)',
  },
  editor: {
    role: 'editor',
    title: 'CineRide Studio',
    subtitle: 'Editorial Workspace',
    icon: '✏',
    gradient: 'from-slate-900 via-blue-950 to-indigo-950',
    cardBg: 'bg-slate-900/90 border-blue-700/30',
    accentBtn: 'bg-blue-600 hover:bg-blue-700',
    accentText: 'text-blue-400',
    accentRing: 'focus-visible:ring-blue-500',
    inputBorder: 'border-blue-900/50 bg-slate-800/80 text-gray-100 placeholder:text-gray-500',
    hint: 'Use credentials from the bootstrap credentials file.',
    description: 'Create movies, publish content, and manage your editorial workflow.',
    decorPattern: 'radial-gradient(circle at 80% 20%, rgba(59,130,246,0.08) 0%, transparent 50%)',
  },
  reviewer: {
    role: 'reviewer',
    title: 'Review Gateway',
    subtitle: 'Content Quality Assurance',
    icon: '🔍',
    gradient: 'from-gray-950 via-purple-950 to-violet-950',
    cardBg: 'bg-gray-900/90 border-purple-700/30',
    accentBtn: 'bg-purple-600 hover:bg-purple-700',
    accentText: 'text-purple-400',
    accentRing: 'focus-visible:ring-purple-500',
    inputBorder: 'border-purple-900/50 bg-gray-800/80 text-gray-100 placeholder:text-gray-500',
    hint: 'Use credentials from the bootstrap credentials file.',
    description: 'Review, approve, or reject content submissions with documented reasoning.',
    decorPattern: 'radial-gradient(circle at 50% 90%, rgba(147,51,234,0.08) 0%, transparent 50%)',
  },
  dispatcher: {
    role: 'dispatcher',
    title: 'Dispatch Hub',
    subtitle: 'Operations & Ride Management',
    icon: '📋',
    gradient: 'from-gray-950 via-orange-950 to-amber-950',
    cardBg: 'bg-gray-900/90 border-orange-700/30',
    accentBtn: 'bg-orange-600 hover:bg-orange-700',
    accentText: 'text-orange-400',
    accentRing: 'focus-visible:ring-orange-500',
    inputBorder: 'border-orange-900/50 bg-gray-800/80 text-gray-100 placeholder:text-gray-500',
    hint: 'Use credentials from the bootstrap credentials file.',
    description: 'Manage ride requests, resolve disputes, and oversee daily operations.',
    decorPattern: 'radial-gradient(circle at 80% 80%, rgba(234,88,12,0.08) 0%, transparent 50%)',
  },
  user: {
    role: 'regular_user',
    title: 'CineRide',
    subtitle: 'Movies, Content & Rides',
    icon: '🎬',
    gradient: 'from-gray-900 via-emerald-950 to-teal-950',
    cardBg: 'bg-gray-900/90 border-emerald-700/30',
    accentBtn: 'bg-emerald-600 hover:bg-emerald-700',
    accentText: 'text-emerald-400',
    accentRing: 'focus-visible:ring-emerald-500',
    inputBorder: 'border-emerald-900/50 bg-gray-800/80 text-gray-100 placeholder:text-gray-500',
    hint: 'Use credentials from the bootstrap credentials file.',
    description: 'Browse movies, read content, and request rides for your community.',
    decorPattern: 'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.08) 0%, transparent 50%)',
  },
};

export default function LoginPage() {
  const params = useParams();
  const location = window.location.pathname;
  const portal = params.portal || (['admin','editor','reviewer','dispatcher'].find(p => location.startsWith(`/${p}/login`))) || 'user';
  const config = PORTALS[portal];
  const navigate = useNavigate();
  const { login, loading, error, user, token } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);

  if (token && user) {
    return <Navigate to={`/${portal === 'user' ? '' : portal + '/'}dashboard`} replace />;
  }

  if (!config) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await login(username, password, portal);
    if (ok) {
      const dashPath = portal === 'user' ? '/dashboard' : `/${portal}/dashboard`;
      navigate(dashPath);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${config.gradient} relative overflow-hidden`}
      style={{ backgroundImage: config.decorPattern }}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-[0.03] bg-white blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-[0.02] bg-white blur-3xl" />
        {portal === 'dispatcher' && (
          <>
            <div className="absolute top-10 left-10 text-orange-900/10 text-[120px] font-bold select-none">DISPATCH</div>
            <div className="absolute bottom-10 right-10 text-orange-900/10 text-[80px] font-bold select-none">OPS</div>
          </>
        )}
        {portal === 'admin' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-900/5 text-[200px] select-none">
            {config.icon}
          </div>
        )}
        {portal === 'editor' && (
          <div className="absolute top-10 right-10 text-blue-900/10 text-[100px] select-none rotate-12">
            {config.icon}
          </div>
        )}
        {portal === 'reviewer' && (
          <>
            <div className="absolute top-20 left-20 w-2 h-2 bg-purple-500/20 rounded-full" />
            <div className="absolute top-40 right-32 w-3 h-3 bg-purple-500/15 rounded-full" />
            <div className="absolute bottom-32 left-40 w-2 h-2 bg-purple-500/20 rounded-full" />
          </>
        )}
        {portal === 'user' && (
          <div className="absolute bottom-20 right-20 text-emerald-900/10 text-[140px] select-none -rotate-12">
            {config.icon}
          </div>
        )}
      </div>

      <div className={`relative z-10 w-full max-w-md mx-4 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        {/* Card */}
        <div className={`rounded-2xl border shadow-2xl ${config.cardBg} p-8`}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">{config.icon}</div>
            <h1 className="text-2xl font-bold text-white">{config.title}</h1>
            <p className={`text-sm mt-1 ${config.accentText}`}>{config.subtitle}</p>
            <p className="text-xs text-gray-500 mt-2 max-w-xs mx-auto">{config.description}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full h-11 rounded-lg border px-4 text-sm outline-none transition-all ${config.inputBorder} ${config.accentRing} focus-visible:ring-2`}
                placeholder="Enter your username"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full h-11 rounded-lg border px-4 text-sm outline-none transition-all ${config.inputBorder} ${config.accentRing} focus-visible:ring-2`}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-300 bg-red-950/50 border border-red-800/30 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              className={`w-full h-11 rounded-lg text-sm font-semibold text-white transition-all duration-150 ${config.accentBtn} disabled:opacity-50`}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

        </div>

      </div>
    </div>
  );
}

export { PORTALS };
