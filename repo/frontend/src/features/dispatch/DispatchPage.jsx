import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import { useToastStore } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatters';
import { DISPUTE_RESOLUTIONS } from '../../utils/constants';

export default function DispatchPage() {
  const { addToast } = useToastStore();
  const [queue, setQueue] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [selectedRide, setSelectedRide] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [resolveForm, setResolveForm] = useState({ resolution: 'no_action', notes: '' });
  const [tab, setTab] = useState('queue');
  const [carpoolCandidates, setCarpoolCandidates] = useState([]);
  const [selectedForCarpool, setSelectedForCarpool] = useState([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [qRes, dRes] = await Promise.all([
        api.get('/dispatch/queue'),
        api.get('/dispatch/disputes')
      ]);
      setQueue(qRes.rides || []);
      setDisputes(dRes.disputes || []);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleAccept(id) {
    try {
      await api.post(`/dispatch/rides/${id}/accept`, { notes: '' });
      addToast('Ride accepted', 'success');
      loadData();
      setSelectedRide(null);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleTransition(id, toStatus) {
    try {
      await api.post(`/dispatch/rides/${id}/transition`, { to_status: toStatus });
      addToast(`Ride moved to ${toStatus}`, 'success');
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleApproveCancellation(id) {
    try {
      await api.post(`/dispatch/rides/${id}/approve-cancel`);
      addToast('Cancellation approved', 'success');
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleResolveDispute(id) {
    try {
      await api.post(`/dispatch/disputes/${id}/resolve`, resolveForm);
      addToast('Dispute resolved', 'success');
      setSelectedDispute(null);
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleAssignDispute(id) {
    try {
      await api.post(`/dispatch/disputes/${id}/assign`);
      addToast('Dispute assigned to you', 'success');
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadCarpoolCandidates(rideId) {
    try {
      const res = await api.get(`/dispatch/carpool/candidates/${rideId}`);
      setCarpoolCandidates(res.candidates || []);
      setSelectedForCarpool([rideId]);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleGroupCarpool() {
    if (selectedForCarpool.length < 2) {
      addToast('Select at least 2 rides to group', 'warning');
      return;
    }
    try {
      const res = await api.post('/dispatch/carpool/group', { ride_ids: selectedForCarpool });
      addToast(`Carpool group created: ${res.group_id} (${res.total_riders} riders)`, 'success');
      setCarpoolCandidates([]);
      setSelectedForCarpool([]);
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  }

  function toggleCarpoolSelection(rideId) {
    setSelectedForCarpool(prev =>
      prev.includes(rideId) ? prev.filter(id => id !== rideId) : [...prev, rideId]
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Dispatch Center</h1>

      <div className="flex flex-wrap gap-2">
        <button className={`btn-sm ${tab === 'queue' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('queue')}>
          Ride Queue ({queue.length})
        </button>
        <button className={`btn-sm ${tab === 'disputes' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('disputes')}>
          Disputes ({disputes.length})
        </button>
      </div>

      {tab === 'queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card overflow-hidden">
            <div className="p-3 border-b bg-muted/50 font-medium text-sm">Pending Rides</div>
            {queue.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No pending rides</div>
            ) : (
              <div className="divide-y">
                {queue.map(ride => (
                  <div key={ride._id} className="p-3 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedRide(ride)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{ride.pickup_text} → {ride.dropoff_text}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {ride.rider_count} rider(s) · {ride.vehicle_type} · {formatDateTime(ride.time_window_start)}
                        </div>
                      </div>
                      <StatusBadge status={ride.status} />
                    </div>
                    {ride.cancellation_requested && <div className="badge-warning mt-1 text-xs">Cancellation requested</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedRide && (
            <div className="card p-4 space-y-3">
              <h3 className="font-semibold">Ride Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">From:</span> {selectedRide.pickup_text}</div>
                <div><span className="text-muted-foreground">To:</span> {selectedRide.dropoff_text}</div>
                <div><span className="text-muted-foreground">Riders:</span> {selectedRide.rider_count}</div>
                <div><span className="text-muted-foreground">Vehicle:</span> {selectedRide.vehicle_type}</div>
                <div><span className="text-muted-foreground">Requester:</span> {selectedRide.requester?.display_name}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {selectedRide.status === 'pending_match' && (
                  <button className="btn-primary btn-sm" onClick={() => handleAccept(selectedRide._id)}>Accept</button>
                )}
                {selectedRide.is_carpool && selectedRide.status === 'pending_match' && (
                  <button className="btn-outline btn-sm" onClick={() => loadCarpoolCandidates(selectedRide._id)}>Find Carpool Matches</button>
                )}
                {selectedRide.status === 'accepted' && (
                  <button className="btn-primary btn-sm" onClick={() => handleTransition(selectedRide._id, 'in_progress')}>Start</button>
                )}
                {selectedRide.status === 'in_progress' && (
                  <button className="btn-primary btn-sm" onClick={() => handleTransition(selectedRide._id, 'completed')}>Complete</button>
                )}
                {selectedRide.cancellation_requested && (
                  <button className="btn-destructive btn-sm" onClick={() => handleApproveCancellation(selectedRide._id)}>Approve Cancel</button>
                )}
              </div>

              {selectedRide.is_carpool && <span className="badge bg-blue-100 text-blue-800 text-xs">Carpool eligible</span>}
              {selectedRide.carpool_group_id && <span className="badge bg-green-100 text-green-800 text-xs">Group: {selectedRide.carpool_group_id}</span>}

              {carpoolCandidates.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <div className="text-sm font-medium">Carpool Candidates</div>
                  {carpoolCandidates.map(c => (
                    <div key={c._id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selectedForCarpool.includes(c._id)}
                        onChange={() => toggleCarpoolSelection(c._id)} />
                      <span>{c.pickup_text} → {c.dropoff_text}</span>
                      <span className="text-muted-foreground">({c.rider_count} riders)</span>
                    </div>
                  ))}
                  <button className="btn-primary btn-sm" onClick={handleGroupCarpool}
                    disabled={selectedForCarpool.length < 2}>
                    Group Selected ({selectedForCarpool.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'disputes' && (
        <div className="space-y-3">
          {disputes.length === 0 ? (
            <div className="card p-8 text-center text-muted-foreground">No open disputes</div>
          ) : disputes.map(d => (
            <div key={d._id} className="card p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">{d.ride_request?.pickup_text} → {d.ride_request?.dropoff_text}</span>
                  <div className="text-sm text-muted-foreground mt-1">
                    Reason: {d.reason?.replace('_', ' ')} · By: {d.initiated_by?.display_name}
                  </div>
                  {d.detail && <p className="text-sm mt-1">{d.detail}</p>}
                </div>
                <div className="flex gap-2 items-center">
                  <StatusBadge status={d.status} />
                  {d.status === 'open' && (
                    <button className="btn-sm btn-outline" onClick={() => handleAssignDispute(d._id)}>Assign to Me</button>
                  )}
                  {['open', 'investigating'].includes(d.status) && (
                    <button className="btn-sm btn-primary" onClick={() => setSelectedDispute(d)}>Resolve</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolve Dispute Modal */}
      <Modal isOpen={!!selectedDispute} onClose={() => setSelectedDispute(null)} title="Resolve Dispute" size="md">
        {selectedDispute && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Resolution</label>
              <select className="input mt-1" value={resolveForm.resolution}
                onChange={e => setResolveForm(f => ({ ...f, resolution: e.target.value }))}>
                {DISPUTE_RESOLUTIONS.map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Notes (encrypted at rest)</label>
              <textarea className="input mt-1 h-24" value={resolveForm.notes}
                onChange={e => setResolveForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setSelectedDispute(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => handleResolveDispute(selectedDispute._id)}>Resolve</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
