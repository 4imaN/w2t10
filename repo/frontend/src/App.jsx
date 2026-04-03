import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import AppShell from './components/layout/AppShell';
import ToastContainer from './components/ui/Toast';
import LoginPage from './features/auth/LoginPage';
import ForcePasswordChange from './features/auth/ForcePasswordChange';
import DashboardPage from './features/dashboard/DashboardPage';
import MoviesPage from './features/movies/MoviesPage';
import MovieImportPage from './features/movies/MovieImportPage';
import ContentPage from './features/content/ContentPage';
import RidesPage from './features/rides/RidesPage';
import DispatchPage from './features/dispatch/DispatchPage';
import SensorsPage from './features/sensors/SensorsPage';
import LedgerPage from './features/ledger/LedgerPage';
import UsersPage from './features/admin/UsersPage';
import ConfigPage from './features/admin/ConfigPage';
import SearchPage from './features/search/SearchPage';

// Maps roles to their dashboard and login paths
const ROLE_DASHBOARD = {
  administrator: '/admin/dashboard',
  editor: '/editor/dashboard',
  reviewer: '/reviewer/dashboard',
  dispatcher: '/dispatcher/dashboard',
  regular_user: '/dashboard',
};

const ROLE_LOGIN = {
  administrator: '/admin/login',
  editor: '/editor/login',
  reviewer: '/reviewer/login',
  dispatcher: '/dispatcher/login',
  regular_user: '/login',
};

function ProtectedRoute({ children, roles }) {
  const { user, token, mustChangePassword } = useAuthStore();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <ForcePasswordChange />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROLE_DASHBOARD[user.role] || '/dashboard'} replace />;
  }
  return children;
}

function RoleDashboardRedirect() {
  const { user } = useAuthStore();
  return <Navigate to={ROLE_DASHBOARD[user?.role] || '/dashboard'} replace />;
}

function LoginRedirectIfAuth({ portal }) {
  const { token, user } = useAuthStore();
  if (token && user) {
    return <Navigate to={ROLE_DASHBOARD[user.role] || '/dashboard'} replace />;
  }
  return <LoginPage />;
}

export default function App() {
  const { token } = useAuthStore();

  return (
    <>
      <ToastContainer />
      <Routes>
        {/* ── Role-specific login portals ─────────────────── */}
        <Route path="/admin/login" element={<LoginRedirectIfAuth portal="admin" />} />
        <Route path="/editor/login" element={<LoginRedirectIfAuth portal="editor" />} />
        <Route path="/reviewer/login" element={<LoginRedirectIfAuth portal="reviewer" />} />
        <Route path="/dispatcher/login" element={<LoginRedirectIfAuth portal="dispatcher" />} />
        <Route path="/login" element={<LoginRedirectIfAuth portal="user" />} />

        {/* Generic portal route (catch custom portals) */}
        <Route path="/:portal/login" element={<LoginPage />} />

        {/* ── Authenticated workspace ─────────────────────── */}
        <Route path="/" element={
          <ProtectedRoute><AppShell /></ProtectedRoute>
        }>
          <Route index element={<RoleDashboardRedirect />} />

          {/* Role-specific dashboard routes */}
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="admin/dashboard" element={
            <ProtectedRoute roles={['administrator']}><DashboardPage /></ProtectedRoute>
          } />
          <Route path="editor/dashboard" element={
            <ProtectedRoute roles={['editor']}><DashboardPage /></ProtectedRoute>
          } />
          <Route path="reviewer/dashboard" element={
            <ProtectedRoute roles={['reviewer']}><DashboardPage /></ProtectedRoute>
          } />
          <Route path="dispatcher/dashboard" element={
            <ProtectedRoute roles={['dispatcher']}><DashboardPage /></ProtectedRoute>
          } />

          {/* Shared feature routes */}
          <Route path="movies" element={<MoviesPage />} />
          <Route path="movies/import" element={
            <ProtectedRoute roles={['administrator', 'editor']}><MovieImportPage /></ProtectedRoute>
          } />
          <Route path="content" element={<ContentPage />} />
          <Route path="rides" element={<RidesPage />} />
          <Route path="dispatch" element={
            <ProtectedRoute roles={['administrator', 'dispatcher']}><DispatchPage /></ProtectedRoute>
          } />
          <Route path="sensors" element={
            <ProtectedRoute roles={['administrator', 'dispatcher']}><SensorsPage /></ProtectedRoute>
          } />
          <Route path="ledger" element={
            <ProtectedRoute roles={['administrator', 'dispatcher']}><LedgerPage /></ProtectedRoute>
          } />
          <Route path="admin/users" element={
            <ProtectedRoute roles={['administrator']}><UsersPage /></ProtectedRoute>
          } />
          <Route path="admin/config" element={
            <ProtectedRoute roles={['administrator']}><ConfigPage /></ProtectedRoute>
          } />
          <Route path="search" element={<SearchPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={
          token ? <RoleDashboardRedirect /> : <Navigate to="/login" replace />
        } />
      </Routes>
    </>
  );
}
