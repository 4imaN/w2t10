import React, { useState, useEffect } from 'react';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatRelativeTime } from '../../utils/formatters';

function MetricCard({ label, value, color = 'text-primary', loading }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      {loading ? (
        <div className="h-8 mt-1 bg-muted rounded animate-pulse" />
      ) : (
        <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      )}
    </div>
  );
}

function SectionError({ message, onRetry }) {
  return (
    <div className="text-center py-4">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <button className="btn-outline btn-sm mt-2" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [ridesData, setRidesData] = useState({ rides: [], total: 0, error: null });
  const [contentData, setContentData] = useState({ items: [], total: 0, error: null });
  const [recsData, setRecsData] = useState({ movies: [], error: null });

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    // Load each section independently — one failure doesn't block others
    const [ridesResult, contentResult, recsResult] = await Promise.allSettled([
      api.get('/rides?limit=5'),
      api.get('/content?limit=5'),
      api.get('/recommendations/movies?limit=6')
    ]);

    setRidesData(
      ridesResult.status === 'fulfilled'
        ? { rides: ridesResult.value.rides || [], total: ridesResult.value.total || 0, error: null }
        : { rides: [], total: 0, error: ridesResult.reason?.message || 'Failed to load rides' }
    );

    setContentData(
      contentResult.status === 'fulfilled'
        ? { items: contentResult.value.items || [], total: contentResult.value.total || 0, error: null }
        : { items: [], total: 0, error: contentResult.reason?.message || 'Failed to load content' }
    );

    setRecsData(
      recsResult.status === 'fulfilled'
        ? { movies: recsResult.value.movies || [], error: null }
        : { movies: [], error: recsResult.reason?.message || 'Failed to load recommendations' }
    );

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Welcome, {user?.display_name || user?.username}</h1>
        <p className="text-sm text-muted-foreground capitalize">{user?.role?.replace('_', ' ')} Dashboard</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Ride Requests" value={ridesData.total} color="text-accent" loading={loading} />
        <MetricCard label="Content Items" value={contentData.total} color="text-blue-600" loading={loading} />
        <MetricCard label="Recommendations" value={recsData.movies.length} color="text-green-600" loading={loading} />
        <MetricCard label="Role" value={user?.role?.replace('_', ' ')} loading={false} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Recent Rides</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : ridesData.error ? (
            <SectionError message={ridesData.error} onRetry={loadDashboard} />
          ) : ridesData.rides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rides yet</p>
          ) : (
            <div className="space-y-2">
              {ridesData.rides.map(ride => (
                <div key={ride._id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="text-sm">
                    <span className="font-medium">{ride.pickup_text}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span>{ride.dropoff_text}</span>
                  </div>
                  <StatusBadge status={ride.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-3">Recent Content</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : contentData.error ? (
            <SectionError message={contentData.error} onRetry={loadDashboard} />
          ) : contentData.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No content yet</p>
          ) : (
            <div className="space-y-2">
              {contentData.items.map(item => (
                <div key={item._id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="text-sm">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-muted-foreground text-xs ml-2">{item.content_type}</span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Recommended Movies</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i}>
                <div className="aspect-[2/3] bg-muted rounded-md animate-pulse" />
                <div className="h-3 bg-muted rounded mt-1 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : recsData.error ? (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Recommended Movies</h2>
          <SectionError message={recsData.error} onRetry={loadDashboard} />
        </div>
      ) : recsData.movies.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Recommended Movies</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {recsData.movies.map(movie => (
              <div key={movie._id} className="text-center">
                <div className="aspect-[2/3] bg-muted rounded-md flex items-center justify-center mb-1 overflow-hidden">
                  {movie.poster ? (
                    <img src={`/uploads/posters/${movie.poster.filename}`} alt={movie.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">🎬</span>
                  )}
                </div>
                <p className="text-xs font-medium truncate">{movie.title}</p>
                <span className={`badge-${movie.mpaa_rating?.replace('-', '')} text-[10px]`}>{movie.mpaa_rating}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
