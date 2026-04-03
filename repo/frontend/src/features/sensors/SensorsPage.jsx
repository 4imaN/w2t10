import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { useToastStore } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatters';

export default function SensorsPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const isAdmin = user?.role === 'administrator';
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [readings, setReadings] = useState([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ device_id: '', label: '', unit: '', range_min: '', range_max: '', spike_threshold: '', drift_threshold: '' });
  const [showSecret, setShowSecret] = useState(null); // { device_id, secret }
  const [secretAcked, setSecretAcked] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => { loadDevices(); }, []);

  async function loadDevices() {
    try {
      const res = await api.get('/sensors/devices');
      setDevices(res.devices || []);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function loadReadings(deviceId) {
    try {
      const res = await api.get(`/sensors/readings/${deviceId}?limit=50`);
      setReadings(res.readings || []);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleCreateDevice(e) {
    e.preventDefault();
    try {
      const body = { ...deviceForm };
      if (body.range_min) body.range_min = parseFloat(body.range_min);
      if (body.range_max) body.range_max = parseFloat(body.range_max);
      if (body.spike_threshold) body.spike_threshold = parseFloat(body.spike_threshold);
      if (body.drift_threshold) body.drift_threshold = parseFloat(body.drift_threshold);
      const res = await api.post('/sensors/devices', body);
      setShowAddDevice(false);
      setShowSecret({ device_id: res.device.device_id, secret: res.device_secret });
      setSecretAcked(false);
      setSecretCopied(false);
      loadDevices();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleRotateSecret(deviceId) {
    const device = devices.find(d => d.device_id === deviceId);
    if (!device) return;
    try {
      const res = await api.post(`/sensors/devices/${device._id}/rotate-secret`);
      setShowSecret({ device_id: deviceId, secret: res.device_secret });
      setSecretAcked(false);
      setSecretCopied(false);
      addToast('Secret rotated — save the new secret now', 'warning');
    } catch (err) { addToast(err.message, 'error'); }
  }

  function copySecret() {
    if (showSecret?.secret) {
      navigator.clipboard.writeText(showSecret.secret).then(() => {
        setSecretCopied(true);
        addToast('Secret copied to clipboard', 'success');
      }).catch(() => addToast('Copy failed — select and copy manually', 'error'));
    }
  }

  function dismissSecret() {
    if (!secretAcked) return;
    setShowSecret(null);
  }

  function selectDevice(device) {
    setSelectedDevice(device);
    loadReadings(device.device_id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Environmental Sensors</h1>
        {isAdmin && <button className="btn-primary btn-sm" onClick={() => setShowAddDevice(true)}>+ Add Device</button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card overflow-hidden">
          <div className="p-3 border-b bg-muted/50 font-medium text-sm">Devices ({devices.length})</div>
          <div className="divide-y">
            {devices.map(d => (
              <div key={d._id}
                className={`p-3 cursor-pointer hover:bg-muted/30 ${selectedDevice?._id === d._id ? 'bg-accent/5 border-l-2 border-accent' : ''}`}
                onClick={() => selectDevice(d)}>
                <div className="font-medium text-sm">{d.label || d.device_id}</div>
                <div className="text-xs text-muted-foreground">{d.device_id} · {d.unit} · {d.sampling_rate_hz}Hz</div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={d.status} />
                  {isAdmin && (
                    <button className="text-[10px] text-muted-foreground hover:text-accent underline"
                      onClick={(e) => { e.stopPropagation(); handleRotateSecret(d.device_id); }}>
                      Rotate Secret
                    </button>
                  )}
                </div>
              </div>
            ))}
            {devices.length === 0 && <div className="p-4 text-center text-muted-foreground text-sm">No devices registered</div>}
          </div>
        </div>

        <div className="lg:col-span-2 card overflow-hidden">
          {selectedDevice ? (
            <>
              <div className="p-3 border-b bg-muted/50">
                <div className="font-medium">{selectedDevice.label || selectedDevice.device_id}</div>
                <div className="text-xs text-muted-foreground">
                  Range: {selectedDevice.range_min ?? '—'} – {selectedDevice.range_max ?? '—'} {selectedDevice.unit} ·
                  Spike: {selectedDevice.spike_threshold ?? '—'} · Drift: {selectedDevice.drift_threshold ?? '—'}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2">Timestamp</th>
                    <th className="text-left px-3 py-2">Value</th>
                    <th className="text-left px-3 py-2">Unit</th>
                    <th className="text-left px-3 py-2">Cleaned</th>
                    <th className="text-left px-3 py-2">Outlier Flags</th>
                    <th className="text-left px-3 py-2">Drift (s)</th>
                  </tr></thead>
                  <tbody>
                    {readings.map((r, i) => (
                      <tr key={i} className={`border-b ${(r.outlier_flags?.range || r.outlier_flags?.spike || r.outlier_flags?.drift) ? 'bg-destructive/5' : ''}`}>
                        <td className="px-3 py-2 font-mono">{formatDateTime(r.timestamp)}</td>
                        <td className="px-3 py-2 font-mono font-bold">{r.value}</td>
                        <td className="px-3 py-2">{r.unit}</td>
                        <td className="px-3 py-2">{r.is_cleaned ? '✓' : '✗'}</td>
                        <td className="px-3 py-2">
                          {r.outlier_flags?.range && <span className="badge-destructive mr-1">range</span>}
                          {r.outlier_flags?.spike && <span className="badge-warning mr-1">spike</span>}
                          {r.outlier_flags?.drift && <span className="badge-accent mr-1">drift</span>}
                          {!r.outlier_flags?.range && !r.outlier_flags?.spike && !r.outlier_flags?.drift && <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">{r.time_drift_seconds?.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {readings.length === 0 && <div className="p-4 text-center text-muted-foreground text-sm">No readings</div>}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground">Select a device to view readings</div>
          )}
        </div>
      </div>

      <Modal isOpen={showAddDevice} onClose={() => setShowAddDevice(false)} title="Register Sensor Device" size="md">
        <form onSubmit={handleCreateDevice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">Device ID *</label>
              <input className="input mt-1" value={deviceForm.device_id} onChange={e => setDeviceForm(f => ({ ...f, device_id: e.target.value }))} required /></div>
            <div><label className="text-sm font-medium">Label</label>
              <input className="input mt-1" value={deviceForm.label} onChange={e => setDeviceForm(f => ({ ...f, label: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">Unit</label>
              <input className="input mt-1" value={deviceForm.unit} onChange={e => setDeviceForm(f => ({ ...f, unit: e.target.value }))} placeholder="°C, %, ppm" /></div>
            <div><label className="text-sm font-medium">Range Min</label>
              <input type="number" step="any" className="input mt-1" value={deviceForm.range_min} onChange={e => setDeviceForm(f => ({ ...f, range_min: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">Range Max</label>
              <input type="number" step="any" className="input mt-1" value={deviceForm.range_max} onChange={e => setDeviceForm(f => ({ ...f, range_max: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">Spike Threshold</label>
              <input type="number" step="any" className="input mt-1" value={deviceForm.spike_threshold} onChange={e => setDeviceForm(f => ({ ...f, spike_threshold: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowAddDevice(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Device</button>
          </div>
        </form>
      </Modal>

      {/* One-Time Secret Display Modal */}
      <Modal isOpen={!!showSecret} onClose={() => {}} title="Device Secret — Save Now" size="md">
        {showSecret && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                This secret will NOT be shown again after you close this dialog.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Copy it now and store it securely on the sensor device.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Device ID</label>
              <div className="font-mono text-sm mt-1">{showSecret.device_id}</div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Device Secret</label>
              <div className="flex gap-2 mt-1">
                <code className="flex-1 bg-muted p-2 rounded font-mono text-xs break-all select-all">
                  {showSecret.secret}
                </code>
                <button className="btn-outline btn-sm flex-shrink-0" onClick={copySecret}>
                  {secretCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <input type="checkbox" id="ack-secret" checked={secretAcked}
                onChange={e => setSecretAcked(e.target.checked)}
                className="mt-1" />
              <label htmlFor="ack-secret" className="text-sm">
                I have saved this secret securely. I understand it cannot be retrieved later.
              </label>
            </div>

            <button className="btn-primary w-full" disabled={!secretAcked} onClick={dismissSecret}>
              {secretAcked ? 'Close' : 'Acknowledge to continue'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
