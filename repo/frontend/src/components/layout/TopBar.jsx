import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { getTheme } from '../../utils/themes';
import api from '../../services/api';

export default function TopBar({ onMenuToggle }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const t = getTheme(user?.role);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (searchQuery.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/search/suggest?q=${encodeURIComponent(searchQuery)}`);
        setSuggestions(res.suggestions || []);
        setShowSuggestions(true);
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setShowSuggestions(false);
      setShowMobileSearch(false);
    }
  };

  return (
    <header className={`h-14 border-b ${t.topBarBg} flex items-center px-3 sm:px-4 gap-2 sm:gap-4 sticky top-0 z-10`}>
      {/* Mobile hamburger */}
      <button
        onClick={onMenuToggle}
        className={`md:hidden p-2 rounded-lg ${t.textSecondary}`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 5h16M2 10h16M2 15h16" />
        </svg>
      </button>

      {/* Desktop search */}
      <form onSubmit={handleSearch} className="relative flex-1 max-w-xl hidden sm:block">
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Search... (Ctrl+K)"
          className={`w-full h-9 rounded-lg border pl-9 pr-3 text-sm outline-none transition-all ${t.inputBg} ${t.inputFocus} focus-visible:ring-2`}
        />
        <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.textMuted} text-sm`}>🔍</span>
        {showSuggestions && suggestions.length > 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1 ${t.cardBg} border rounded-lg shadow-xl max-h-64 overflow-y-auto z-50`}>
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                className={`w-full text-left px-3 py-2 text-sm ${t.textPrimary} hover:opacity-80 flex items-center gap-2`}
                onMouseDown={() => { setSearchQuery(s.text); navigate(`/search?q=${encodeURIComponent(s.text)}`); setShowSuggestions(false); }}>
                <span className={`text-xs ${t.textMuted} capitalize`}>{s.type}</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Mobile search toggle */}
      <button onClick={() => setShowMobileSearch(!showMobileSearch)} className={`sm:hidden p-2 rounded-lg ${t.textSecondary}`}>
        🔍
      </button>

      <div className="flex-1 sm:hidden" />

      <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-lg text-sm ${t.textSecondary}`} title="Toggle dark mode">
        {darkMode ? '☀' : '🌙'}
      </button>

      <div className={`text-sm ${t.textSecondary} hidden sm:block truncate max-w-[120px]`}>
        {user?.display_name}
      </div>

      {/* Mobile search overlay */}
      {showMobileSearch && (
        <div className={`absolute top-14 left-0 right-0 p-3 ${t.topBarBg} border-b sm:hidden z-20`}>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..." className={`flex-1 h-9 rounded-lg border px-3 text-sm outline-none ${t.inputBg}`} autoFocus />
            <button type="submit" className={`px-3 h-9 rounded-lg text-sm text-white ${t.accentBg}`}>Go</button>
          </form>
        </div>
      )}
    </header>
  );
}
