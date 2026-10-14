import { useEffect, useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { CalendarCheck, FileText, Wrench, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardData {
  upcomingJobs: number;
  openInvoices: number;
  recentJob?: { id: string; jobType: string; status: string; scheduledStart: string };
}

export default function PortalDashboard() {
  const { session, fetchApi } = usePortal();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [jobsRes, invoicesRes] = await Promise.all([
          fetchApi('/jobs'),
          fetchApi('/invoices'),
        ]);

        const jobs = jobsRes.ok ? await jobsRes.json() : [];
        const invoices = invoicesRes.ok ? await invoicesRes.json() : [];

        const upcomingJobs = jobs.filter((j: any) =>
          ['draft', 'scheduled', 'confirmed', 'en_route'].includes(j.status)
        );
        const openInvoices = invoices.filter((i: any) =>
          ['draft', 'sent', 'overdue'].includes(i.status)
        );

        setData({
          upcomingJobs: upcomingJobs.length,
          openInvoices: openInvoices.length,
          recentJob: upcomingJobs[0] || null,
        });
      } catch {
        // Silently fail — dashboard will show empty state
      }
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

  const customerName = session?.customer?.firstName || 'Valued Customer';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Welcome back, {customerName}!</h1>
        <p className="text-slate-500 text-sm mt-1">Here's a summary of your irrigation services.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/portal/appointments"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-green-300 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <CalendarCheck className="h-8 w-8 text-green-500" />
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-green-500 transition-colors" />
          </div>
          <p className="text-3xl font-extrabold text-slate-800">{data?.upcomingJobs ?? 0}</p>
          <p className="text-sm text-slate-500">Upcoming Appointments</p>
        </Link>

        <Link
          to="/portal/invoices"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-green-300 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <FileText className="h-8 w-8 text-blue-500" />
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
          </div>
          <p className="text-3xl font-extrabold text-slate-800">{data?.openInvoices ?? 0}</p>
          <p className="text-sm text-slate-500">Open Invoices</p>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/portal/service-request"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Request Service</p>
              <p className="text-xs text-slate-500">Schedule a new appointment</p>
            </div>
          </Link>

          <Link
            to="/portal/appointments"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">View Schedule</p>
              <p className="text-xs text-slate-500">Check your upcoming visits</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      {data?.recentJob && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Next Appointment</h2>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <CalendarCheck className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800 capitalize">
                {data.recentJob.jobType.replace('_', ' ')}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(data.recentJob.scheduledStart).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium capitalize">
              {data.recentJob.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
