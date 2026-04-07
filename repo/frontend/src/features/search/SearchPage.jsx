import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatters';

const SUGGEST_DEBOUNCE_MS = 250;

const SORT_OPTIONS_BY_TYPE = {
  '': [
    { value: '', label: 'Relevance' },
    { value: 'popularity', label: 'Popularity' },
    { value: 'newest', label: 'Newest' },
    { value: 'rating', label: 'Rating' },
  ],
  movie: [
    { value: '', label: 'Relevance' },
    { value: 'popularity', label: 'Popularity' },
    { value: 'newest', label: 'Newest' },
    { value: 'rating', label: 'Rating' },
  ],
  content: [
    { value: '', label: 'Relevance' },
    { value: 'newest', label: 'Newest' },
  ],
  user: [
    { value: '', label: 'Relevance' },
  ],
};

export default function SearchPage() {
  const { user } = useAuthStore();
  const canSearchUsers = ['administrator', 'dispatcher'].includes(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState({ movies: [], content: [], users: [], total: 0 });
  const [type, setType] = useState('');
  const [sort, setSort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const suggestRef = useRef(null);
  const inputRef = useRef(null);

  const typeRef = useRef(type);
  const sortRef = useRef(sort);
  typeRef.current = type;
  sortRef.current = sort;

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      doSearch(q, typeRef.current, sortRef.current);
    }
  }, [searchParams]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestTimer = useRef(null);

  function fetchSuggestions(q) {
    clearTimeout(suggestTimer.current);
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/search/suggest?q=${encodeURIComponent(q.trim())}`);
        setSuggestions(res.suggestions || []);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, SUGGEST_DEBOUNCE_MS);
  }

  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    fetchSuggestions(val);
  }

  function handleKeyDown(e) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  function selectSuggestion(suggestion) {
    const text = suggestion.text || suggestion;
    setQuery(text);
    setShowSuggestions(false);
    setSuggestions([]);
    setSearchParams({ q: text });
    doSearch(text, type, sort);
  }

  async function doSearch(q, searchType, searchSort) {
    if (!q || !q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (searchType) params.set('type', searchType);
      if (searchSort) params.set('sort', searchSort);
      const res = await api.get(`/search?${params}`);
      setResults(res);
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.');
      setResults({ movies: [], content: [], users: [], total: 0 });
    }
    setLoading(false);
  }

  const handleSearch = (e) => {
    e.preventDefault();
    setShowSuggestions(false);
    setSearchParams({ q: query });
    doSearch(query, type, sort);
  };

  function handleTypeChange(newType) {
    const allowed = SORT_OPTIONS_BY_TYPE[newType] || SORT_OPTIONS_BY_TYPE[''];
    const sortStillValid = allowed.some(o => o.value === sort);
    const effectiveSort = sortStillValid ? sort : '';
    setType(newType);
    if (!sortStillValid) setSort('');
    if (query) doSearch(query, newType, effectiveSort);
  }

  function handleSortChange(newSort) {
    setSort(newSort);
    if (query) doSearch(query, type, newSort);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Search</h1>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1" ref={suggestRef}>
          <input
            ref={inputRef}
            className="input w-full"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder="Search movies, content, users..."
            autoFocus
            role="combobox"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            aria-controls="search-suggestions"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s._id || s.text || i}
                  role="option"
                  aria-selected={i === selectedIndex}
                  className={`px-4 py-2 cursor-pointer text-sm ${
                    i === selectedIndex
                      ? 'bg-blue-100 dark:bg-blue-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  onMouseDown={() => selectSuggestion(s)}
                >
                  <span>{s.text}</span>
                  {s.type && (
                    <span className="ml-2 text-xs text-gray-400">{s.type}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className="btn-primary w-full sm:w-auto">Search</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {['', 'movie', 'content', ...(canSearchUsers ? ['user'] : [])].map(t => (
          <button key={t} className={`btn-sm ${type === t ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleTypeChange(t)}>
            {t || 'All'}{t === 'movie' ? 's' : t === 'user' ? 's' : ''}
          </button>
        ))}
        <select className="input w-full sm:w-36 h-8 text-xs" value={sort}
          onChange={e => handleSortChange(e.target.value)}
          data-testid="sort-select">
          {(SORT_OPTIONS_BY_TYPE[type] || SORT_OPTIONS_BY_TYPE['']).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center text-muted-foreground py-8">Searching...</div>}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && results.total > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{results.total} results found</p>

          {results.movies?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Movies ({results.movies.length})</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {results.movies.map(m => (
                  <div key={m._id} className="card p-3">
                    <h3 className="font-medium text-sm">{m.title}</h3>
                    <div className="flex gap-1 mt-1">
                      <span className={`badge-${(m.mpaa_rating || 'NR').replace('-', '')} text-[10px]`}>{m.mpaa_rating}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
                    <div className="text-xs text-muted-foreground mt-1">{formatDate(m.release_date)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.content?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Content ({results.content.length})</h2>
              <div className="space-y-2">
                {results.content.map(c => (
                  <div key={c._id} className="card p-3 flex justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{c.title}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{c.content_type} · {c.author?.display_name}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.users?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Users ({results.users.length})</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {results.users.map(u => (
                  <div key={u._id} className="card p-3">
                    <div className="font-medium text-sm">{u.display_name || u.username}</div>
                    <div className="text-xs text-muted-foreground">@{u.username}</div>
                    <StatusBadge status={u.role} label={u.role?.replace('_', ' ')} />
                    {u.phone && <div className="text-xs font-mono mt-1">{u.phone}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !error && results.total === 0 && query && (
        <div className="text-center text-muted-foreground py-8">
          No results found for "{query}". Try a different search term.
        </div>
      )}
    </div>
  );
}

export { SORT_OPTIONS_BY_TYPE };
