import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import useAuthStore from '../../store/authStore';
import { getTheme } from '../../utils/themes';

export default function AppShell() {
  const { user } = useAuthStore();
  const t = getTheme(user?.role);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className={`flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 ${t.mainBg}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
