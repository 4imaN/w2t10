import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { MPAA_RATINGS } from '../../utils/constants';

export default function MoviesPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const isStaff = ['administrator', 'editor'].includes(user?.role);
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({ sort: 'newest', search: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showEdit, setShowEdit] = useState(null);
  const [showRevisions, setShowRevisions] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', mpaa_rating: 'NR', categories: '', tags: '', release_date: '' });
  const [editForm, setEditForm] = useState({ title: '', description: '', mpaa_rating: 'NR', categories: '', tags: '', release_date: '' });
  const [viewMode, setViewMode] = useState('grid');
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadMovies(); }, [page, filters.sort]);

  async function loadMovies() {
    try {
      const params = new URLSearchParams({ page, limit: 20, sort: filters.sort });
      if (filters.search) params.set('search', filters.search);
      const res = await api.get(`/movies?${params}`);
      setMovies(res.movies || []);
      setPages(res.pages || 1);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const body = {
        ...form,
        categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
        tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
        release_date: form.release_date || undefined
      };
      await api.post('/movies', body);
      addToast('Movie created', 'success');
      setShowCreate(false);
      setForm({ title: '', description: '', mpaa_rating: 'NR', categories: '', tags: '', release_date: '' });
      loadMovies();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleEdit(e) {
    e.preventDefault();
    try {
      const body = {
        title: editForm.title,
        description: editForm.description,
        mpaa_rating: editForm.mpaa_rating,
        categories: editForm.categories.split(',').map(s => s.trim()).filter(Boolean),
        tags: editForm.tags.split(',').map(s => s.trim()).filter(Boolean),
        release_date: editForm.release_date || undefined
      };
      const res = await api.put(`/movies/${showEdit._id}`, body);
      addToast('Movie updated', 'success');
      setShowEdit(null);
      setShowDetail(res.movie);
      loadMovies();
    } catch (err) { addToast(err.message, 'error'); }
  }

  function openEdit(movie) {
    setEditForm({
      title: movie.title || '',
      description: movie.description || '',
      mpaa_rating: movie.mpaa_rating || 'NR',
      categories: (movie.categories || []).join(', '),
      tags: (movie.tags || []).join(', '),
      release_date: movie.release_date ? movie.release_date.split('T')[0] : ''
    });
    setShowEdit(movie);
  }

  async function handlePosterUpload(movieId, e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      addToast('Only JPG and PNG files are allowed', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast('File must be under 10 MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('poster', file);
      const res = await api.upload(`/movies/${movieId}/poster`, fd);
      addToast('Poster uploaded', 'success');
      setShowDetail(res.movie);
      loadMovies();
    } catch (err) { addToast(err.message, 'error'); }
    setUploading(false);
  }

  async function handleStillsUpload(movieId, e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of files) {
      if (!['image/jpeg', 'image/png'].includes(f.type)) {
        addToast(`${f.name}: Only JPG/PNG allowed`, 'error');
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        addToast(`${f.name}: Must be under 10 MB`, 'error');
        return;
      }
    }
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('stills', f);
      const res = await api.upload(`/movies/${movieId}/stills`, fd);
      addToast(`${files.length} still(s) uploaded`, 'success');
      setShowDetail(res.movie);
    } catch (err) { addToast(err.message, 'error'); }
    setUploading(false);
  }

  async function handleUnpublish(id) {
    try {
      const res = await api.post(`/movies/${id}/unpublish`);
      addToast('Movie unpublished', 'success');
      setShowDetail(res.movie);
      loadMovies();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleRepublish(id) {
    try {
      const res = await api.post(`/movies/${id}/republish`);
      addToast('Movie republished', 'success');
      setShowDetail(res.movie);
      loadMovies();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadRevisions(movieId) {
    try {
      const res = await api.get(`/movies/${movieId}/revisions`);
      setRevisions(res.revisions || []);
      setShowRevisions(movieId);
    } catch (err) { addToast(err.message, 'error'); }
  }

  const handleSearch = (e) => {
    e.preventDefault();
    loadMovies();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Movies</h1>
        <div className="flex flex-wrap gap-2">
          <button className={`btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('grid')}>Grid</button>
          <button className={`btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('list')}>List</button>
          {isStaff && <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Add Movie</button>}
          {isStaff && <button className="btn-outline btn-sm" onClick={() => navigate('/movies/import')}>Import</button>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input className="input flex-1" placeholder="Search movies..." value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          <button type="submit" className="btn-outline btn-sm">Search</button>
        </form>
        <select className="input w-full sm:w-40" value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}>
          <option value="newest">Newest</option>
          <option value="popularity">Popularity</option>
          <option value="title">Title</option>
          <option value="rating">Rating</option>
        </select>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {movies.map(movie => (
            <div key={movie._id} className="card overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowDetail(movie)}>
              <div className="aspect-[2/3] bg-muted flex items-center justify-center overflow-hidden">
                {movie.poster ? (
                  <img src={`/uploads/posters/${movie.poster.filename}`} alt={movie.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                ) : (<span className="text-4xl">🎬</span>)}
              </div>
              <div className="p-2">
                <h3 className="text-sm font-medium truncate">{movie.title}</h3>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`badge-${(movie.mpaa_rating || 'NR').replace('-', '')} text-[10px]`}>{movie.mpaa_rating || 'NR'}</span>
                  {!movie.is_published && <StatusBadge status="unpublished" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{formatDate(movie.release_date)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Rating</th>
                <th className="text-left px-4 py-3">Categories</th>
                <th className="text-left px-4 py-3">Release</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr></thead>
              <tbody>
                {movies.map(movie => (
                  <tr key={movie._id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setShowDetail(movie)}>
                    <td className="px-4 py-3 font-medium">{movie.title}</td>
                    <td className="px-4 py-3"><span className={`badge-${(movie.mpaa_rating || 'NR').replace('-', '')}`}>{movie.mpaa_rating}</span></td>
                    <td className="px-4 py-3 text-xs">{(movie.categories || []).join(', ')}</td>
                    <td className="px-4 py-3">{formatDate(movie.release_date)}</td>
                    <td className="px-4 py-3">{movie.is_published ? <StatusBadge status="published" /> : <StatusBadge status="unpublished" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* ── Create Modal ────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Movie" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title *</label>
            <input className="input mt-1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea className="input mt-1 h-24" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">MPAA Rating</label>
              <select className="input mt-1" value={form.mpaa_rating} onChange={e => setForm(f => ({ ...f, mpaa_rating: e.target.value }))}>
                {MPAA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Release Date</label>
              <input type="date" className="input mt-1" value={form.release_date} onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Categories (comma-separated)</label>
            <input className="input mt-1" value={form.categories} onChange={e => setForm(f => ({ ...f, categories: e.target.value }))} placeholder="Action, Comedy, Drama" />
          </div>
          <div>
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <input className="input mt-1" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="new-release, staff-pick" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Movie</button>
          </div>
        </form>
      </Modal>

      {/* ── Detail Modal ────────────────────────── */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail?.title || 'Movie'} size="xl">
        {showDetail && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Poster with upload */}
              <div className="flex-shrink-0 space-y-2">
                <div className="w-full sm:w-40 h-56 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {showDetail.poster ? (
                    <img src={`/uploads/posters/${showDetail.poster.filename}`} alt={showDetail.title} className="w-full h-full object-cover" />
                  ) : <span className="text-5xl">🎬</span>}
                </div>
                {isStaff && (
                  <label className={`btn-outline btn-sm w-full text-center cursor-pointer block ${uploading ? 'opacity-50' : ''}`}>
                    {uploading ? 'Uploading...' : 'Upload Poster'}
                    <input type="file" accept="image/jpeg,image/png" className="hidden"
                      onChange={(e) => handlePosterUpload(showDetail._id, e)} disabled={uploading} />
                  </label>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-2">
                <h2 className="text-lg font-bold">{showDetail.title}</h2>
                <p className="text-sm text-muted-foreground">{showDetail.description || 'No description'}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className={`badge-${(showDetail.mpaa_rating || 'NR').replace('-', '')}`}>{showDetail.mpaa_rating}</span>
                  {showDetail.is_published ? <StatusBadge status="published" /> : <StatusBadge status="unpublished" />}
                </div>
                <div className="text-sm"><strong>Release:</strong> {formatDate(showDetail.release_date)}</div>
                <div className="text-sm"><strong>Categories:</strong> {(showDetail.categories || []).join(', ') || 'None'}</div>
                <div className="text-sm"><strong>Tags:</strong> {(showDetail.tags || []).join(', ') || 'None'}</div>
                {showDetail.poster && (
                  <div className="text-xs text-muted-foreground">
                    Poster: {showDetail.poster.original_name} ({(showDetail.poster.size / 1024).toFixed(0)} KB)
                  </div>
                )}
              </div>
            </div>

            {/* Stills gallery */}
            {(showDetail.stills?.length > 0 || isStaff) && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Stills ({showDetail.stills?.length || 0})</h3>
                  {isStaff && (
                    <label className={`btn-outline btn-sm cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
                      + Upload Stills
                      <input type="file" accept="image/jpeg,image/png" multiple className="hidden"
                        onChange={(e) => handleStillsUpload(showDetail._id, e)} disabled={uploading} />
                    </label>
                  )}
                </div>
                {showDetail.stills?.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {showDetail.stills.map((still, i) => (
                      <div key={i} className="aspect-video bg-muted rounded overflow-hidden">
                        <img src={`/uploads/stills/${still.filename}`} alt={still.original_name}
                          className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Staff actions */}
            {isStaff && (
              <div className="flex flex-wrap gap-2 pt-3 border-t">
                <button className="btn-primary btn-sm" onClick={() => openEdit(showDetail)}>Edit Metadata</button>
                {showDetail.is_published ? (
                  <button className="btn-outline btn-sm" onClick={() => handleUnpublish(showDetail._id)}>Unpublish</button>
                ) : (
                  <button className="btn-primary btn-sm" onClick={() => handleRepublish(showDetail._id)}>Republish</button>
                )}
                <button className="btn-outline btn-sm" onClick={() => loadRevisions(showDetail._id)}>
                  View Revision History
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Edit Modal ────────────────────────── */}
      <Modal isOpen={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit: ${showEdit?.title}`} size="lg">
        {showEdit && (
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <input className="input mt-1" value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea className="input mt-1 h-24" value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">MPAA Rating</label>
                <select className="input mt-1" value={editForm.mpaa_rating}
                  onChange={e => setEditForm(f => ({ ...f, mpaa_rating: e.target.value }))}>
                  {MPAA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Release Date</label>
                <input type="date" className="input mt-1" value={editForm.release_date}
                  onChange={e => setEditForm(f => ({ ...f, release_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Categories (comma-separated)</label>
              <input className="input mt-1" value={editForm.categories}
                onChange={e => setEditForm(f => ({ ...f, categories: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Tags (comma-separated)</label>
              <input className="input mt-1" value={editForm.tags}
                onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setShowEdit(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Save Changes</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Revision History Modal ────────────── */}
      <Modal isOpen={!!showRevisions} onClose={() => setShowRevisions(null)} title="Revision History" size="xl">
        <div className="space-y-3">
          {revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No revisions recorded</p>
          ) : (
            revisions.map((rev, i) => (
              <div key={rev._id || i} className="card p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge text-xs ${
                    rev.change_type === 'create' ? 'bg-green-100 text-green-800' :
                    rev.change_type === 'edit' ? 'bg-blue-100 text-blue-800' :
                    rev.change_type === 'import_merge' ? 'bg-purple-100 text-purple-800' :
                    rev.change_type === 'unpublish' ? 'bg-red-100 text-red-800' :
                    rev.change_type === 'republish' ? 'bg-emerald-100 text-emerald-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {rev.change_type?.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(rev.timestamp)}</span>
                </div>
                {rev.snapshot && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div><strong>Title:</strong> {rev.snapshot.title}</div>
                    {rev.snapshot.mpaa_rating && <div><strong>Rating:</strong> {rev.snapshot.mpaa_rating}</div>}
                    {rev.snapshot.categories?.length > 0 && <div><strong>Categories:</strong> {rev.snapshot.categories.join(', ')}</div>}
                    {rev.snapshot.tags?.length > 0 && <div><strong>Tags:</strong> {rev.snapshot.tags.join(', ')}</div>}
                    <div><strong>Published:</strong> {rev.snapshot.is_published ? 'Yes' : 'No'}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
