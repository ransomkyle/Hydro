import { useEffect, useState, FormEvent } from 'react';
import { usePortal } from '../context/PortalContext';
import { Wrench, MapPin, Calendar, Clock, Send, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface Property {
  id: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

const JOB_TYPES = [
  { value: 'system_startup', label: 'System Startup / Spring Activation' },
  { value: 'winterization', label: 'Winterization / Blowout' },
  { value: 'repair', label: 'Repair / Troubleshooting' },
  { value: 'installation', label: 'New Installation' },
  { value: 'maintenance', label: 'Routine Maintenance' },
  { value: 'inspection', label: 'Inspection / Audit' },
  { value: 'other', label: 'Other' },
];

export default function PortalServiceRequest() {
  const { fetchApi } = usePortal();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    propertyId: '',
    jobType: '',
    description: '',
    preferredDate: '',
    preferredTime: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi('/customer');
        if (res.ok) {
          const customer = await res.json();
          setProperties(customer.properties || []);
          if (customer.properties?.length > 0) {
            setForm((f) => ({ ...f, propertyId: customer.properties[0].id }));
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [fetchApi]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.propertyId || !form.jobType) {
      setError('Please select a property and service type.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchApi('/service-request', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: form.propertyId,
          jobType: form.jobType,
          description: form.description,
          preferredDate: form.preferredDate || null,
          preferredTime: form.preferredTime || null,
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit request.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <div className="bg-white rounded-2xl border border-green-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Request Submitted!</h2>
          <p className="text-sm text-slate-500 mb-6">
            We've received your service request. A team member will contact you to confirm your appointment.
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              setForm({ propertyId: properties[0]?.id || '', jobType: '', description: '', preferredDate: '', preferredTime: '' });
            }}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800">Request Service</h1>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Property selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> Property
            </span>
          </label>
          {properties.length === 0 ? (
            <p className="text-sm text-slate-400">No properties on file. Please contact your service provider.</p>
          ) : (
            <select
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.streetAddress}, {p.city}, {p.state} {p.zipCode}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Job type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <span className="flex items-center gap-1.5">
              <Wrench className="h-4 w-4" /> Service Type
            </span>
          </label>
          <select
            value={form.jobType}
            onChange={(e) => setForm({ ...form, jobType: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
          >
            <option value="">Select a service...</option>
            {JOB_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Briefly describe what you need..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
          />
        </div>

        {/* Preferred date/time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Preferred Date
              </span>
            </label>
            <input
              type="date"
              value={form.preferredDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Preferred Time
              </span>
            </label>
            <input
              type="time"
              value={form.preferredTime}
              onChange={(e) => setForm({ ...form, preferredTime: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || properties.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          <Send className="h-4 w-4" />
          {submitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
