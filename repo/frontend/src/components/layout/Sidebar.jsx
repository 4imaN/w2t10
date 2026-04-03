import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { getTheme, WORKSPACE_TITLES } from '../../utils/themes';
import { ROLE_LABELS } from '../../utils/constants';

const NAV_ITEMS = {
  administrator: [
    { path: '/admin/dashboard', label: 'Dashboard', icon: '⊞' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/content', label: 'Content', icon: '📝' },
    { path: '/rides', label: 'Rides', icon: '🚗' },
    { path: '/dispatch', label: 'Dispatch', icon: '📋' },
    { path: '/sensors', label: 'Sensors', icon: '📡' },
    { path: '/ledger', label: 'Ledger', icon: '💰' },
    { path: '/admin/users', label: 'Users', icon: '👤' },
    { path: '/admin/config', label: 'Config', icon: '⚙' },
    { path: '/search', label: 'Search', icon: '🔍' },
  ],
  editor: [
    { path: '/editor/dashboard', label: 'Dashboard', icon: '⊞' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/content', label: 'Content', icon: '📝' },
    { path: '/rides', label: 'Rides', icon: '🚗' },
    { path: '/search', label: 'Search', icon: '🔍' },
  ],
  reviewer: [
    { path: '/reviewer/dashboard', label: 'Dashboard', icon: '⊞' },
    { path: '/content', label: 'Review Queue', icon: '📝' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/rides', label: 'Rides', icon: '🚗' },
    { path: '/search', label: 'Search', icon: '🔍' },
  ],
  dispatcher: [
    { path: '/dispatcher/dashboard', label: 'Dashboard', icon: '⊞' },
    { path: '/dispatch', label: 'Dispatch', icon: '📋' },
    { path: '/rides', label: 'Rides', icon: '🚗' },
    { path: '/sensors', label: 'Sensors', icon: '📡' },
    { path: '/ledger', label: 'Ledger', icon: '💰' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/search', label: 'Search', icon: '🔍' },
  ],
  regular_user: [
    { path: '/dashboard', label: 'Dashboard', icon: '⊞' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/content', label: 'Content', icon: '📝' },
    { path: '/rides', label: 'My Rides', icon: '🚗' },
    { path: '/search', label: 'Search', icon: '🔍' },
  ]
};

const ROLE_LOGIN_MAP = {
  administrator: '/admin/login',
  editor: '/editor/login',
  reviewer: '/reviewer/login',
  dispatcher: '/dispatcher/login',
  regular_user: '/login',
};

export default function Sidebar({ mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = NAV_ITEMS[user?.role] || NAV_ITEMS.regular_user;
  const t = getTheme(user?.role);
  const title = WORKSPACE_TITLES[user?.role] || 'CineRide';

  // Close mobile menu on route change
  useEffect(() => {
    onMobileClose?.();
  }, [location.pathname]);

  const handleLogout = async () => {
    const loginPath = ROLE_LOGIN_MAP[user?.role] || '/login';
    await logout();
    navigate(loginPath);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={`flex items-center justify-between p-4 border-b ${t.sidebarBorder}`}>
        {!collapsed && (
          <div>
            <span className={`font-bold text-base ${t.sidebarLogo}`}>{title.split(' ')[0]}</span>
            <span className={`font-light text-xs block ${t.sidebarText}`}>{title.split(' ').slice(1).join(' ')}</span>
          </div>
        )}
        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1.5 rounded-md ${t.sidebarHover} ${t.sidebarText} text-xs hidden md:block`}
        >
          {collapsed ? '→' : '←'}
        </button>
        {/* Mobile close */}
        <button
          onClick={onMobileClose}
          className={`p-1.5 rounded-md ${t.sidebarHover} ${t.sidebarText} text-xs md:hidden`}
        >
          ✕
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-100 border-l-2 ${
                isActive
                  ? `${t.sidebarActiveBg} ${t.sidebarActiveText} ${t.sidebarActiveBorder}`
                  : `${t.sidebarText} ${t.sidebarHover} border-transparent`
              }`
            }
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className={`border-t ${t.sidebarBorder} p-3`}>
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className={`w-8 h-8 rounded-full ${t.sidebarAvatarBg} flex items-center justify-center text-xs font-bold ${t.sidebarActiveText} flex-shrink-0`}>
            {user?.display_name?.[0] || user?.username?.[0] || '?'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${t.sidebarActiveText}`}>{user?.display_name || user?.username}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.roleBadge}`}>
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={`mt-2 w-full text-xs py-1.5 rounded-md ${t.sidebarText} ${t.sidebarHover} transition-all ${collapsed ? 'px-1 text-center' : 'px-2 text-left'}`}
        >
          {collapsed ? '⏻' : 'Sign Out'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col ${t.sidebarBg} border-r ${t.sidebarBorder} transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'} min-h-screen`}>
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={onMobileClose} />
          <aside className={`fixed inset-y-0 left-0 w-64 ${t.sidebarBg} border-r ${t.sidebarBorder} flex flex-col z-50 shadow-2xl`}>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
