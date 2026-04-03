import React, { useState } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../components/ui/Toast';

export default function MovieImportPage() {
  const { addToast } = useToastStore();
  const [job, setJob] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload('/movie-import/upload', formData);
      setJob(res.job);
      addToast(`Import job created: ${res.job.total_records} records, ${res.job.conflict_count} conflicts`, 'info');
    } catch (err) { addToast(err.message, 'error'); }
    setUploading(false);
  }

  async function handleResolve(recordIdx, field, resolution) {
    try {
      const res = await api.put(`/movie-import/${job._id}/resolve/${recordIdx}`, {
        resolutions: { [field]: resolution }
      });
      setJob(res.job);
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function handleExecute() {
    try {
      const res = await api.post(`/movie-import/${job._id}/execute`);
      setJob(res.job);
      addToast(`Import complete: ${res.job.imported_count} imported, ${res.job.skipped_count} skipped`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Movie Import</h1>

      {!job && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground mb-4">Upload a JSON or CSV file to import movies</p>
          <input type="file" accept=".json,.csv" onChange={handleUpload} disabled={uploading} className="mx-auto" />
          {uploading && <p className="text-sm text-muted-foreground mt-2">Processing...</p>}
        </div>
      )}

      {job && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold">Import Job: {job.filename}</h2>
                <p className="text-sm text-muted-foreground">
                  {job.total_records} records | {job.conflict_count} conflicts | Status: {job.status}
                </p>
              </div>
              {job.status !== 'completed' && (
                <button className="btn-primary" onClick={handleExecute}>Execute Import</button>
              )}
            </div>
          </div>

          {job.records?.filter(r => r.conflicts?.length > 0).map((record, rIdx) => (
            <div key={rIdx} className="card p-4 space-y-3">
              <h3 className="font-medium">Record: {record.imported_data?.title || `#${rIdx + 1}`}</h3>
              <p className="text-xs text-muted-foreground">Status: {record.status}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Field</th>
                    <th className="text-left py-2">Existing</th>
                    <th className="text-left py-2">Imported</th>
                    <th className="text-left py-2">Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {record.conflicts.map((conflict, cIdx) => (
                    <tr key={cIdx} className="border-b">
                      <td className="py-2 font-medium">{conflict.field}</td>
                      <td className="py-2 text-xs">{JSON.stringify(conflict.existing_value)}</td>
                      <td className="py-2 text-xs font-medium text-accent">{JSON.stringify(conflict.imported_value)}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <button
                            className={`btn-sm ${conflict.resolution === 'keep_existing' ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => handleResolve(rIdx, conflict.field, 'keep_existing')}
                          >Keep</button>
                          <button
                            className={`btn-sm ${conflict.resolution === 'use_imported' ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => handleResolve(rIdx, conflict.field, 'use_imported')}
                          >Import</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
