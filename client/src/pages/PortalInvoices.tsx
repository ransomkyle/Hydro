import { useEffect, useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { FileText, Download, Loader2 } from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueDate: string;
  createdAt: string;
  paidAt: string | null;
  job?: {
    jobType: string;
    property: { streetAddress: string; city: string; state: string };
  };
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

export default function PortalInvoices() {
  const { fetchApi } = usePortal();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi('/invoices');
        if (res.ok) setInvoices(await res.json());
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

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800">My Invoices</h1>

      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No invoices yet</p>
          <p className="text-sm text-slate-400 mt-1">Your billing records will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">
                      Invoice #{inv.invoiceNumber || inv.id.slice(0, 8)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[inv.status] || 'bg-slate-100 text-slate-700'}`}>
                      {inv.status}
                    </span>
                  </div>

                  {inv.job && (
                    <p className="text-xs text-slate-500 mb-1 capitalize">
                      {inv.job.jobType.replace(/_/g, ' ')} – {inv.job.property.streetAddress}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                    <span>Due: {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {inv.paidAt && (
                      <span className="text-green-600">
                        Paid: {new Date(inv.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-slate-800">
                    ${inv.totalAmount.toFixed(2)}
                  </p>
                  {inv.status === 'sent' && (
                    <button className="mt-2 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                      <Download className="h-3 w-3" />
                      Pay Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
