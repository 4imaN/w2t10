import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatters';
import { CONTENT_TYPES } from '../../utils/constants';

function TypeSpecificFields({ formState, setFormState }) {
  const ct = formState.content_type;
  if (ct === 'gallery') {
    const items = formState.gallery_items || [];
    return (
      <div className="space-y-2 border rounded-lg p-3">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium">Gallery Items</label>
          <button type="button" className="btn-outline btn-sm"
            onClick={() => setFormState(f => ({ ...f, gallery_items: [...(f.gallery_items || []), { media_url: '', caption: '' }] }))}>
            + Add Item
          </button>
        </div>
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Media URL or path"
              value={item.media_url || ''} onChange={e => {
                const updated = [...items]; updated[i] = { ...updated[i], media_url: e.target.value };
                setFormState(f => ({ ...f, gallery_items: updated }));
              }} />
            <input className="input text-sm" placeholder="Caption"
              value={item.caption || ''} onChange={e => {
                const updated = [...items]; updated[i] = { ...updated[i], caption: e.target.value };
                setFormState(f => ({ ...f, gallery_items: updated }));
              }} />
          </div>
        ))}
      </div>
    );
  }
  if (ct === 'video') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border rounded-lg p-3">
        <div>
          <label className="text-xs font-medium">Video URL *</label>
          <input className="input mt-1 text-sm" value={formState.video_url || ''}
            onChange={e => setFormState(f => ({ ...f, video_url: e.target.value }))} placeholder="/uploads/video.mp4" />
        </div>
        <div>
          <label className="text-xs font-medium">Duration (sec)</label>
          <input type="number" className="input mt-1 text-sm" value={formState.video_duration_seconds || ''}
            onChange={e => setFormState(f => ({ ...f, video_duration_seconds: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium">Format</label>
          <input className="input mt-1 text-sm" value={formState.video_format || ''} placeholder="mp4, webm"
            onChange={e => setFormState(f => ({ ...f, video_format: e.target.value }))} />
        </div>
      </div>
    );
  }
  if (ct === 'event') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border rounded-lg p-3">
        <div>
          <label className="text-xs font-medium">Event Date *</label>
          <input type="datetime-local" className="input mt-1 text-sm" value={formState.event_date || ''}
            onChange={e => setFormState(f => ({ ...f, event_date: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium">End Date</label>
          <input type="datetime-local" className="input mt-1 text-sm" value={formState.event_end_date || ''}
            onChange={e => setFormState(f => ({ ...f, event_end_date: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium">Location</label>
          <input className="input mt-1 text-sm" value={formState.event_location || ''} placeholder="Main Hall"
            onChange={e => setFormState(f => ({ ...f, event_location: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium">Capacity</label>
          <input type="number" className="input mt-1 text-sm" value={formState.event_capacity || ''}
            onChange={e => setFormState(f => ({ ...f, event_capacity: e.target.value }))} />
        </div>
      </div>
    );
  }
  return null;
}

export default function ContentPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const isStaff = ['administrator', 'editor'].includes(user?.role);
  const isReviewer = ['administrator', 'reviewer'].includes(user?.role);
  const isEditorial = ['administrator', 'editor', 'reviewer'].includes(user?.role);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showReview, setShowReview] = useState(null);
  const [form, setForm] = useState({
    title: '', body: '', content_type: 'article', scheduled_publish_date: '',
    gallery_items: [{ media_url: '', caption: '' }],
    video_url: '', video_duration_seconds: '', video_format: '',
    event_date: '', event_end_date: '', event_location: '', event_capacity: ''
  });
  const [reviewForm, setReviewForm] = useState({ decision: 'approved', rejection_reason: '' });
  const [warning, setWarning] = useState(null);
  const [showRevisions, setShowRevisions] = useState(null);
  const [reviewHistory, setReviewHistory] = useState([]);
  const [showEdit, setShowEdit] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '', body: '', content_type: 'article', scheduled_publish_date: '',
    gallery_items: [], video_url: '', video_duration_seconds: '', video_format: '',
    event_date: '', event_end_date: '', event_location: '', event_capacity: ''
  });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  useEffect(() => { loadContent(); }, [page, statusFilter]);

  async function loadContent() {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/content?${params}`);
      setItems(res.items || []);
      setPages(res.pages || 1);
    } catch (err) {
      setListError(err.message || 'Failed to load content');
      setItems([]);
    }
    setListLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        scheduled_publish_date: form.scheduled_publish_date || undefined,
        video_duration_seconds: form.video_duration_seconds ? Number(form.video_duration_seconds) : undefined,
        event_capacity: form.event_capacity ? Number(form.event_capacity) : undefined,
      };
      await api.post('/content', payload);
      addToast('Content created as draft', 'success');
      setShowCreate(false);
      setForm({ title: '', body: '', content_type: 'article', scheduled_publish_date: '' });
      loadContent();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleSubmitForReview(id, acknowledged = false) {
    try {
      const res = await api.post(`/content/${id}/submit`, { acknowledgedSensitiveWords: acknowledged });
      if (res.warning) {
        setWarning({ id, flagged_words: res.flagged_words, message: res.message });
      } else {
        addToast('Submitted for review', 'success');
        setWarning(null);
        setShowDetail(null);
        loadContent();
      }
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleReview(id) {
    try {
      await api.post(`/content-review/${id}/review`, reviewForm);
      addToast(`Content ${reviewForm.decision}`, 'success');
      setShowReview(null);
      setReviewForm({ decision: 'approved', rejection_reason: '' });
      loadContent();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadRevisionHistory(id) {
    try {
      const [itemRes, reviewsRes] = await Promise.all([
        api.get(`/content/${id}?revisions=true`),
        api.get(`/content/${id}/reviews`).catch(() => ({ reviews: [] }))
      ]);
      setShowRevisions(itemRes.item);
      setReviewHistory(reviewsRes.reviews || []);
    } catch (err) { addToast(err.message, 'error'); }
  }

  function openEdit(item) {
    setEditForm({
      title: item.title || '',
      body: item.body || '',
      content_type: item.content_type || 'article',
      scheduled_publish_date: item.scheduled_publish_date ? item.scheduled_publish_date.split('T')[0] + 'T' + (item.scheduled_publish_date.split('T')[1] || '00:00').slice(0, 5) : '',
      gallery_items: item.gallery_items || [],
      video_url: item.video_url || '',
      video_duration_seconds: item.video_duration_seconds || '',
      video_format: item.video_format || '',
      event_date: item.event_date ? new Date(item.event_date).toISOString().slice(0, 16) : '',
      event_end_date: item.event_end_date ? new Date(item.event_end_date).toISOString().slice(0, 16) : '',
      event_location: item.event_location || '',
      event_capacity: item.event_capacity || ''
    });
    setShowEdit(item);
    setShowDetail(null);
  }

  function buildEditPayload() {
    return {
      title: editForm.title,
      body: editForm.body,
      content_type: editForm.content_type,
      scheduled_publish_date: editForm.scheduled_publish_date || undefined,
      gallery_items: editForm.gallery_items,
      video_url: editForm.video_url || undefined,
      video_duration_seconds: editForm.video_duration_seconds ? Number(editForm.video_duration_seconds) : undefined,
      video_format: editForm.video_format || undefined,
      event_date: editForm.event_date || undefined,
      event_end_date: editForm.event_end_date || undefined,
      event_location: editForm.event_location || undefined,
      event_capacity: editForm.event_capacity ? Number(editForm.event_capacity) : undefined,
    };
  }

  async function handleEdit(e) {
    e.preventDefault();
    try {
      await api.put(`/content/${showEdit._id}`, buildEditPayload());
      addToast('Content updated', 'success');
      setShowEdit(null);
      loadContent();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleEditAndResubmit(e) {
    e.preventDefault();
    try {
      await api.put(`/content/${showEdit._id}`, buildEditPayload());
      // Immediately submit for review after saving edits
      const res = await api.post(`/content/${showEdit._id}/submit`, { acknowledgedSensitiveWords: false });
      if (res.warning) {
        setWarning({ id: showEdit._id, flagged_words: res.flagged_words, message: res.message });
        setShowEdit(null);
      } else {
        addToast('Content revised and resubmitted for review', 'success');
        setShowEdit(null);
        loadContent();
      }
    } catch (err) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Content</h1>
        {isStaff && <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create Content</button>}
      </div>

      {isEditorial && (
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'in_review_1', 'in_review_2', 'scheduled', 'published'].map(s => (
            <button
              key={s}
              className={`btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      )}

      {listLoading && (
        <div className="card p-8 text-center text-muted-foreground">Loading content...</div>
      )}

      {!listLoading && listError && (
        <div className="card p-6 text-center">
          <p className="text-sm text-destructive">{listError}</p>
          <button className="btn-outline btn-sm mt-2" onClick={loadContent}>Retry</button>
        </div>
      )}

      {!listLoading && !listError && <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3">Title</th>
            <th className="text-left px-4 py-3">Type</th>
            <th className="text-left px-4 py-3">Author</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Updated</th>
            {isEditorial && <th className="text-left px-4 py-3">Actions</th>}
          </tr></thead>
          <tbody>
            {items.map(item => (
              <tr key={item._id} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-medium cursor-pointer" onClick={() => setShowDetail(item)}>{item.title}</td>
                <td className="px-4 py-3 capitalize">{item.content_type}</td>
                <td className="px-4 py-3">{item.author?.display_name || item.author?.username}</td>
                <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-3 text-xs">{formatDateTime(item.updated_at)}</td>
                {isEditorial && (
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {isStaff && item.status === 'draft' && (
                        <button className="btn-sm btn-outline" onClick={() => openEdit(item)}>Edit</button>
                      )}
                      {isStaff && item.status === 'draft' && (
                        <button className="btn-sm btn-primary" onClick={() => handleSubmitForReview(item._id)}>Submit</button>
                      )}
                      {isReviewer && ['in_review_1', 'in_review_2'].includes(item.status) && (
                        <button className="btn-sm btn-accent" onClick={() => setShowReview(item)}>Review</button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Content" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <select className="input mt-1" value={form.content_type} onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))}>
                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Schedule Publish</label>
              <input type="datetime-local" className="input mt-1" value={form.scheduled_publish_date} onChange={e => setForm(f => ({ ...f, scheduled_publish_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Title *</label>
            <input className="input mt-1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm font-medium">Body</label>
            <textarea className="input mt-1 h-32 font-mono text-sm" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          </div>
          <TypeSpecificFields formState={form} setFormState={setForm} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Draft</button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail?.title || 'Content'} size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <StatusBadge status={showDetail.status} />
              <span className="badge-muted capitalize">{showDetail.content_type}</span>
            </div>
            {showDetail.body && <div className="prose max-w-none text-sm whitespace-pre-wrap">{showDetail.body}</div>}
            {showDetail.content_type === 'gallery' && showDetail.gallery_items?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Gallery ({showDetail.gallery_items.length} items)</div>
                {showDetail.gallery_items.map((gi, i) => (
                  <div key={i} className="text-sm flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{gi.media_url}</span>
                    {gi.caption && <span className="text-muted-foreground">— {gi.caption}</span>}
                  </div>
                ))}
              </div>
            )}
            {showDetail.content_type === 'video' && showDetail.video_url && (
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Video:</span> <span className="font-mono text-xs">{showDetail.video_url}</span></div>
                {showDetail.video_duration_seconds && <div><span className="text-muted-foreground">Duration:</span> {showDetail.video_duration_seconds}s</div>}
                {showDetail.video_format && <div><span className="text-muted-foreground">Format:</span> {showDetail.video_format}</div>}
              </div>
            )}
            {showDetail.content_type === 'event' && (
              <div className="text-sm space-y-1">
                {showDetail.event_date && <div><span className="text-muted-foreground">Date:</span> {formatDateTime(showDetail.event_date)}</div>}
                {showDetail.event_end_date && <div><span className="text-muted-foreground">Ends:</span> {formatDateTime(showDetail.event_end_date)}</div>}
                {showDetail.event_location && <div><span className="text-muted-foreground">Location:</span> {showDetail.event_location}</div>}
                {showDetail.event_capacity && <div><span className="text-muted-foreground">Capacity:</span> {showDetail.event_capacity}</div>}
              </div>
            )}
            {showDetail.flagged_words?.length > 0 && (
              <div className="bg-warning/10 text-warning border border-warning/20 rounded-md p-3 text-sm">
                Sensitive words detected: {showDetail.flagged_words.join(', ')}
              </div>
            )}
            {isStaff && showDetail.status === 'draft' && (
              <div className="pt-3 border-t flex flex-wrap gap-2">
                <button className="btn-outline btn-sm" onClick={() => openEdit(showDetail)}>Edit Content</button>
                <button className="btn-primary btn-sm" onClick={() => handleSubmitForReview(showDetail._id)}>Submit for Review</button>
              </div>
            )}
            {(isStaff || isReviewer) && (
              <div className={`${isStaff && showDetail.status === 'draft' ? '' : 'pt-3 border-t'}`}>
                <button className="btn-outline btn-sm" onClick={() => loadRevisionHistory(showDetail._id)}>
                  View Revision &amp; Review History
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit / Revise Modal */}
      <Modal isOpen={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit: ${showEdit?.title || 'Content'}`} size="lg">
        {showEdit && (
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <select className="input mt-1" value={editForm.content_type} onChange={e => setEditForm(f => ({ ...f, content_type: e.target.value }))}>
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Schedule Publish</label>
                <input type="datetime-local" className="input mt-1" value={editForm.scheduled_publish_date}
                  onChange={e => setEditForm(f => ({ ...f, scheduled_publish_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Title *</label>
              <input className="input mt-1" value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium">Body</label>
              <textarea className="input mt-1 h-32 font-mono text-sm" value={editForm.body}
                onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))} />
            </div>
            <TypeSpecificFields formState={editForm} setFormState={setEditForm} />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setShowEdit(null)}>Cancel</button>
              <button type="submit" className="btn-secondary">Save Draft</button>
              <button type="button" className="btn-primary" onClick={handleEditAndResubmit}>Save &amp; Submit for Review</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Revision History Modal */}
      <Modal isOpen={!!showRevisions} onClose={() => setShowRevisions(null)} title="Content History" size="xl">
        {showRevisions && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Revision History ({showRevisions.revisions?.length || 0})</h3>
              {(showRevisions.revisions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No revisions recorded</p>
              ) : (
                <div className="space-y-2">
                  {showRevisions.revisions.map((rev, i) => (
                    <div key={i} className="card p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge text-xs ${
                          rev.change_type === 'create' ? 'bg-green-100 text-green-800' :
                          rev.change_type === 'edit' ? 'bg-blue-100 text-blue-800' :
                          rev.change_type === 'submit_review' ? 'bg-amber-100 text-amber-800' :
                          rev.change_type === 'publish' ? 'bg-emerald-100 text-emerald-800' :
                          rev.change_type === 'revision' ? 'bg-red-100 text-red-800' :
                          rev.change_type === 'unpublish' ? 'bg-gray-100 text-gray-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>{rev.change_type?.replace('_', ' ')}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(rev.timestamp)}</span>
                      </div>
                      {rev.snapshot && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {rev.snapshot.title && <div><strong>Title:</strong> {rev.snapshot.title}</div>}
                          {rev.snapshot.status && <div><strong>Status:</strong> {rev.snapshot.status}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {reviewHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Review Decisions ({reviewHistory.length})</h3>
                <div className="space-y-2">
                  {reviewHistory.map((rev, i) => (
                    <div key={i} className="card p-3 flex flex-wrap items-center gap-2">
                      <span className={`badge text-xs ${rev.decision === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        Step {rev.step}: {rev.decision}
                      </span>
                      <span className="text-xs text-muted-foreground">by {rev.reviewer?.display_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(rev.created_at)}</span>
                      {rev.rejection_reason && (
                        <div className="w-full text-xs text-red-600 mt-1">Reason: {rev.rejection_reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Review Modal */}
      <Modal isOpen={!!showReview} onClose={() => setShowReview(null)} title={`Review: ${showReview?.title}`} size="md">
        {showReview && (
          <div className="space-y-4">
            <div className="prose max-w-none text-sm whitespace-pre-wrap border rounded-md p-3 max-h-60 overflow-y-auto bg-muted/30">
              {showReview.body}
            </div>
            {showReview.flagged_words?.length > 0 && (
              <div className="bg-warning/10 text-warning border border-warning/20 rounded-md p-3 text-sm">
                Editor acknowledged sensitive words: {showReview.flagged_words.join(', ')}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Decision</label>
              <select className="input mt-1" value={reviewForm.decision} onChange={e => setReviewForm(f => ({ ...f, decision: e.target.value }))}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </select>
            </div>
            {reviewForm.decision === 'rejected' && (
              <div>
                <label className="text-sm font-medium">Rejection Reason *</label>
                <textarea className="input mt-1 h-24" value={reviewForm.rejection_reason} onChange={e => setReviewForm(f => ({ ...f, rejection_reason: e.target.value }))} required />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setShowReview(null)}>Cancel</button>
              <button
                className={reviewForm.decision === 'approved' ? 'btn-primary' : 'btn-destructive'}
                onClick={() => handleReview(showReview._id)}
              >
                {reviewForm.decision === 'approved' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sensitive Word Warning */}
      <Modal isOpen={!!warning} onClose={() => setWarning(null)} title="Sensitive Word Warning" size="md">
        {warning && (
          <div className="space-y-4">
            <div className="bg-warning/10 text-warning border border-warning/20 rounded-md p-4">
              <p className="font-medium">Content contains sensitive words:</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {warning.flagged_words.map(w => (
                  <span key={w} className="badge-warning">{w}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setWarning(null)}>Revise Content</button>
              <button className="btn-primary" onClick={() => { handleSubmitForReview(warning.id, true); }}>Submit Anyway</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
