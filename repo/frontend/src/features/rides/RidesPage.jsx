import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { VEHICLE_TYPES, RIDE_STATUSES, DISPUTE_REASONS } from '../../utils/constants';

export default function RidesPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const [rides, setRides] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showDispute, setShowDispute] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [disputeForm, setDisputeForm] = useState({ reason: 'no_show', detail: '' });
  const [feedbackForm, setFeedbackForm] = useState({ rating: 5, comment: '' });
  const [form, setForm] = useState({
    pickup_text: '', dropoff_text: '', rider_count: 1,
    time_window_start: '', time_window_end: '', vehicle_type: 'sedan',
    is_carpool: false
  });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [formErrors, setFormErrors] = useState([]);

  useEffect(() => { loadRides(); }, [page, statusFilter]);

  async function loadRides() {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/rides?${params}`);
      setRides(res.rides || []);
      setPages(res.pages || 1);
    } catch (err) {
      setListError(err.message || 'Failed to load rides');
      setRides([]);
    }
    setListLoading(false);
  }

  function validateRideForm() {
    const errors = [];
    const start = new Date(form.time_window_start);
    const end = new Date(form.time_window_end);
    const now = new Date();
    const minLeadMs = 5 * 60 * 1000; // 5 minutes
    const maxWindowMs = 4 * 60 * 60 * 1000; // 4 hours

    if (!form.time_window_start || !form.time_window_end) {
      errors.push('Both start and end times are required.');
    } else {
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push('Invalid date/time values.');
      } else {
        if (start < new Date(now.getTime() + minLeadMs)) {
          errors.push('Start time must be at least 5 minutes from now.');
        }
        if (end <= start) {
          errors.push('End time must be after start time.');
        }
        if (end - start > maxWindowMs) {
          errors.push('Time window cannot exceed 4 hours.');
        }
      }
    }
    return errors;
  }

  async function handleCreate(e) {
    e.preventDefault();
    const errors = validateRideForm();
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);
    try {
      const body = {
        ...form,
        rider_count: parseInt(form.rider_count),
        time_window_start: new Date(form.time_window_start).toISOString(),
        time_window_end: new Date(form.time_window_end).toISOString()
      };
      await api.post('/rides', body);
      addToast('Ride request created', 'success');
      setShowCreate(false);
      loadRides();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCancel(id) {
    try {
      const res = await api.post(`/rides/${id}/cancel`);
      if (res.requiresApproval) {
        addToast('Cancellation requires dispatcher approval', 'warning');
      } else {
        addToast('Ride canceled', 'success');
      }
      loadRides();
      setShowDetail(null);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadDetail(id) {
    try {
      const res = await api.get(`/rides/${id}`);
      setShowDetail(res.ride);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleDispute(e) {
    e.preventDefault();
    if (!showDetail) return;
    try {
      await api.post('/disputes', {
        ride_request: showDetail._id,
        reason: disputeForm.reason,
        detail: disputeForm.detail
      });
      addToast('Dispute submitted', 'success');
      setShowDispute(false);
      setDisputeForm({ reason: 'no_show', detail: '' });
      loadDetail(showDetail._id);
      loadRides();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleFeedback(e) {
    e.preventDefault();
    if (!showDetail) return;
    try {
      await api.post(`/rides/${showDetail._id}/feedback`, {
        rating: parseInt(feedbackForm.rating),
        comment: feedbackForm.comment
      });
      addToast('Feedback submitted', 'success');
      setShowFeedback(false);
      setFeedbackForm({ rating: 5, comment: '' });
      loadDetail(showDetail._id);
    } catch (err) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      {/* Top bar — wraps on mobile */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Ride Requests</h1>
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Ride</button>
      </div>

      {/* Status filter buttons — flex-wrap so they wrap on small screens */}
      <div className="flex flex-wrap gap-2">
        {['', ...Object.keys(RIDE_STATUSES)].map(s => (
          <button key={s} className={`btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s ? RIDE_STATUSES[s] : 'All'}
          </button>
        ))}
      </div>

      {listLoading && (
        <div className="card p-8 text-center text-muted-foreground">Loading rides...</div>
      )}
      {!listLoading && listError && (
        <div className="card p-6 text-center">
          <p className="text-sm text-destructive">{listError}</p>
          <button className="btn-outline btn-sm mt-2" onClick={loadRides}>Retry</button>
        </div>
      )}
      {!listLoading && !listError && <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3">Route</th>
              <th className="text-left px-4 py-3">Riders</th>
              <th className="text-left px-4 py-3">Vehicle</th>
              <th className="text-left px-4 py-3">Time Window</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {rides.map(ride => (
                <tr key={ride._id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="font-medium">{ride.pickup_text}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span>{ride.dropoff_text}</span>
                  </td>
                  <td className="px-4 py-3">{ride.rider_count}</td>
                  <td className="px-4 py-3 capitalize">{ride.vehicle_type}{ride.is_carpool && <span className="ml-1 badge bg-blue-100 text-blue-800 text-[10px]">carpool</span>}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(ride.time_window_start)} – {formatDateTime(ride.time_window_end)}</td>
                  <td className="px-4 py-3"><StatusBadge status={ride.status} /></td>
                  <td className="px-4 py-3 text-xs">{formatRelativeTime(ride.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="btn-sm btn-outline" onClick={() => loadDetail(ride._id)}>View</button>
                      {['pending_match', 'accepted'].includes(ride.status) && (() => {
                        const created = new Date(ride.created_at);
                        const freeUntil = new Date(created.getTime() + 5 * 60000);
                        const isFree = new Date() <= freeUntil;
                        return isFree
                          ? <button className="btn-sm btn-destructive" onClick={() => handleCancel(ride._id)}>Cancel (free)</button>
                          : <button className="btn-sm btn-outline text-xs" onClick={() => handleCancel(ride._id)} title="Requires dispatcher approval">Cancel *</button>;
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Ride Request" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Pickup Location *</label>
            <input className="input mt-1" value={form.pickup_text} onChange={e => setForm(f => ({ ...f, pickup_text: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm font-medium">Drop-off Location *</label>
            <input className="input mt-1" value={form.dropoff_text} onChange={e => setForm(f => ({ ...f, dropoff_text: e.target.value }))} required />
          </div>
          {/* Form grid: 1 col on mobile, 2 cols on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Rider Count (1-6)</label>
              <input type="number" min="1" max="6" className="input mt-1" value={form.rider_count}
                onChange={e => setForm(f => ({ ...f, rider_count: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Vehicle Type</label>
              <select className="input mt-1" value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}>
                {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Window Start *</label>
              <input type="datetime-local" className="input mt-1" value={form.time_window_start}
                onChange={e => setForm(f => ({ ...f, time_window_start: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium">Window End *</label>
              <input type="datetime-local" className="input mt-1" value={form.time_window_end}
                onChange={e => setForm(f => ({ ...f, time_window_end: e.target.value }))} required />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_carpool" checked={form.is_carpool}
              onChange={e => setForm(f => ({ ...f, is_carpool: e.target.checked }))} />
            <label htmlFor="is_carpool" className="text-sm">Open to carpool (share ride with others going the same direction)</label>
          </div>
          <p className="text-xs text-muted-foreground">Time window max: 4 hours. Start must be at least 5 minutes from now.</p>
          {formErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 space-y-1">
              {formErrors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => { setShowCreate(false); setFormErrors([]); }}>Cancel</button>
            <button type="submit" className="btn-primary">Submit Request</button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="Ride Details" size="lg">
        {showDetail && (
          <div className="space-y-4">
            {/* Detail grid: 1 col on mobile, 2 cols on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><span className="text-sm text-muted-foreground">Pickup:</span><div className="font-medium">{showDetail.pickup_text}</div></div>
              <div><span className="text-sm text-muted-foreground">Drop-off:</span><div className="font-medium">{showDetail.dropoff_text}</div></div>
              <div><span className="text-sm text-muted-foreground">Riders:</span><div>{showDetail.rider_count}</div></div>
              <div><span className="text-sm text-muted-foreground">Vehicle:</span><div className="capitalize">{showDetail.vehicle_type}</div></div>
              <div><span className="text-sm text-muted-foreground">Status:</span><div><StatusBadge status={showDetail.status} /></div></div>
              <div><span className="text-sm text-muted-foreground">Requester:</span><div>{showDetail.requester?.display_name}</div></div>
            </div>

            {/* State transition log */}
            {showDetail.state_transitions?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Status History</h3>
                <div className="space-y-1">
                  {showDetail.state_transitions.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{formatDateTime(t.timestamp)}</span>
                      <StatusBadge status={t.from} />
                      <span>→</span>
                      <StatusBadge status={t.to} />
                      {t.reason && <span className="text-muted-foreground">({t.reason})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDetail.auto_cancel_at && showDetail.status === 'pending_match' && (
              <div className="text-sm text-warning">
                Auto-cancels: {formatDateTime(showDetail.auto_cancel_at)}
              </div>
            )}

            {/* Cancellation rules enforcement in UI */}
            {['pending_match', 'accepted'].includes(showDetail.status) && (() => {
              const created = new Date(showDetail.created_at);
              const freeUntil = new Date(created.getTime() + 5 * 60000);
              const now = new Date();
              const isFree = now <= freeUntil;
              const remainingSec = Math.max(0, Math.floor((freeUntil - now) / 1000));
              const remainMin = Math.floor(remainingSec / 60);
              const remainSec = remainingSec % 60;

              return (
                <div className={`rounded-lg p-3 text-sm ${isFree ? 'bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'}`}>
                  {isFree ? (
                    <>
                      <div className="font-medium text-green-800 dark:text-green-300">Free cancellation available</div>
                      <div className="text-green-600 dark:text-green-400 text-xs">
                        {remainMin}m {remainSec}s remaining — cancel now at no cost
                      </div>
                      <button className="btn-sm btn-destructive mt-2" onClick={() => handleCancel(showDetail._id)}>Cancel Ride (Free)</button>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-amber-800 dark:text-amber-300">Free cancellation window expired</div>
                      <div className="text-amber-600 dark:text-amber-400 text-xs">
                        Cancellation requires dispatcher approval. A request will be sent for review.
                      </div>
                      <button className="btn-sm btn-outline mt-2" onClick={() => handleCancel(showDetail._id)}>Request Cancellation</button>
                    </>
                  )}
                </div>
              );
            })()}

            {showDetail.cancellation_requested && (
              <div className="badge-warning">Cancellation pending dispatcher approval</div>
            )}

            {/* Dispute action — visible for accepted/in_progress/completed rides */}
            {['accepted', 'in_progress', 'completed'].includes(showDetail.status) && !showDispute && (
              <div className="pt-3 border-t">
                <button className="btn-outline btn-sm" onClick={() => setShowDispute(true)}>
                  Report a Problem (Dispute)
                </button>
              </div>
            )}

            {showDispute && (
              <form onSubmit={handleDispute} className="pt-3 border-t space-y-3">
                <h3 className="text-sm font-semibold">Submit Dispute</h3>
                <div>
                  <label className="text-sm font-medium">Reason</label>
                  <select className="input mt-1" value={disputeForm.reason}
                    onChange={e => setDisputeForm(f => ({ ...f, reason: e.target.value }))}>
                    {DISPUTE_REASONS.map(r => (
                      <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Details (optional)</label>
                  <textarea className="input mt-1 h-20" value={disputeForm.detail}
                    onChange={e => setDisputeForm(f => ({ ...f, detail: e.target.value }))}
                    placeholder="Describe what happened..." />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-destructive btn-sm">Submit Dispute</button>
                  <button type="button" className="btn-outline btn-sm" onClick={() => setShowDispute(false)}>Cancel</button>
                </div>
              </form>
            )}

            {/* Feedback action — visible for completed rides without existing feedback */}
            {showDetail.status === 'completed' && !showDetail.feedback?.rating && !showFeedback && (
              <div className="pt-3 border-t">
                <button className="btn-primary btn-sm" onClick={() => setShowFeedback(true)}>
                  Leave Feedback
                </button>
              </div>
            )}

            {showDetail.feedback?.rating && (
              <div className="pt-3 border-t">
                <h3 className="text-sm font-semibold mb-1">Your Feedback</h3>
                <div className="text-sm">{'★'.repeat(showDetail.feedback.rating)}{'☆'.repeat(5 - showDetail.feedback.rating)}</div>
                {showDetail.feedback.comment && <p className="text-sm text-muted-foreground">{showDetail.feedback.comment}</p>}
              </div>
            )}

            {showFeedback && (
              <form onSubmit={handleFeedback} className="pt-3 border-t space-y-3">
                <h3 className="text-sm font-semibold">Rate Your Ride</h3>
                <div>
                  <label className="text-sm font-medium">Rating</label>
                  <div className="flex gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button"
                        className={`text-2xl ${star <= feedbackForm.rating ? 'text-amber-400' : 'text-gray-300'}`}
                        onClick={() => setFeedbackForm(f => ({ ...f, rating: star }))}>
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Comment (optional)</label>
                  <textarea className="input mt-1 h-20" value={feedbackForm.comment}
                    onChange={e => setFeedbackForm(f => ({ ...f, comment: e.target.value }))}
                    placeholder="How was your ride?" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary btn-sm">Submit Feedback</button>
                  <button type="button" className="btn-outline btn-sm" onClick={() => setShowFeedback(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
