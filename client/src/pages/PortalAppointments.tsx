import { useEffect, useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { Calendar, MapPin, Clock, Loader2 } from 'lucide-react';

interface Job {
  id: string;
  jobType: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  notes: string | null;
  property: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };
  assignedTech?: {
    firstName: string;
    lastName: string;
  };
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-cyan-100 text-cyan-700',
  en_route: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PortalAppointments() {
  const { fetchApi } = usePortal();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi('/jobs');
        if (res.ok) setJobs(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [fetchApi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  const upcoming = jobs.filter((j) =>
    ['draft', 'scheduled', 'confirmed', 'en_route', 'in_progress'].includes(j.status)
  );
  const past = jobs.filter((j) => !['draft', 'scheduled', 'confirmed', 'en_route', 'in_progress'].includes(j.status));

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800">My Appointments</h1>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No appointments yet</p>
          <p className="text-sm text-slate-400 mt-1">Your service history will appear here.</p>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((job) => <JobCard key={job.id} job={job} isUpcoming />)}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 mt-6">
                History ({past.length})
              </h2>
              <div className="space-y-3">
                {past.map((job) => <JobCard key={job.id} job={job} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JobCard({ job, isUpcoming = false }: { job: Job; isUpcoming?: boolean }) {
  const statusLabel = job.status.replace(/_/g, ' ');
  const typeLabel = job.jobType.replace(/_/g, ' ');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 capitalize">{typeLabel}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[job.status] || 'bg-slate-100 text-slate-700'}`}>
              {statusLabel}
            </span>
          </div>
          {job.notes && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{job.notes}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span>
            {isUpcoming ? 'Scheduled for ' : 'Was '}
            {new Date(job.scheduledStart).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {' – '}
            {new Date(job.scheduledEnd).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span>
            {job.property.streetAddress}, {job.property.city}, {job.property.state} {job.property.zipCode}
          </span>
        </div>

        {job.assignedTech && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-green-600">
                {job.assignedTech.firstName[0]}{job.assignedTech.lastName[0]}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              Technician: {job.assignedTech.firstName} {job.assignedTech.lastName}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
