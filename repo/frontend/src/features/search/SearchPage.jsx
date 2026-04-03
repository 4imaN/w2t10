import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/formatters';

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

  // Use refs to avoid stale closures when filters change
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
    setSearchParams({ q: query });
    doSearch(query, type, sort);
  };

  function handleTypeChange(newType) {
    setType(newType);
    if (query) doSearch(query, newType, sort);
  }

  function handleSortChange(newSort) {
    setSort(newSort);
    if (query) doSearch(query, type, newSort);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Search</h1>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <input className="input flex-1" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search movies, content, users..." autoFocus />
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
          onChange={e => handleSortChange(e.target.value)}>
          <option value="">Relevance</option>
          <option value="popularity">Popularity</option>
          <option value="newest">Newest</option>
          <option value="rating">Rating</option>
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
