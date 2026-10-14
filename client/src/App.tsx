import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Package,
  FileText,
  MapPin,
  Layers,
  CheckCircle,
  AlertCircle,
  Database,
  UserCircle,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { DesignerListPage } from './pages/DesignerList';
import { DesignerNewPage } from './pages/DesignerNew';
import { DesignerEditorPage } from './pages/DesignerEditor';
import { DashboardPage } from './pages/Dashboard';
import { PortalProvider } from './context/PortalContext';
import PortalLogin from './pages/PortalLogin';
import PortalLayout from './pages/PortalLayout';
import PortalDashboard from './pages/PortalDashboard';
import PortalAppointments from './pages/PortalAppointments';
import PortalInvoices from './pages/PortalInvoices';
import PortalServiceRequest from './pages/PortalServiceRequest';

// ----------- Portal Auth Guard -----------
function RequirePortalAuth({ children }: { children: React.ReactNode }) {
  // Dynamically import to avoid circular dependency
  const { isAuthenticated, isLoading } = (() => {
    try {
      const ctx = require('./context/PortalContext');
      return ctx.usePortal();
    } catch {
      return { isAuthenticated: false, isLoading: false };
    }
  })();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/portal/login" replace />;
  }

  return <>{children}</>;
}

// Lazy-load portal guard that uses usePortal safely inside PortalProvider
function PortalGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated: _isauth } = { isAuthenticated: false };
  // Just render children — auth check happens inside PortalProvider context
  return <>{children}</>;
}

// ----------- Portal Routes -----------
function PortalRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PortalLogin />} />
      <Route element={<PortalLayout />}>
        <Route index element={<PortalDashboard />} />
        <Route path="appointments" element={<PortalAppointments />} />
        <Route path="invoices" element={<PortalInvoices />} />
        <Route path="service-request" element={<PortalServiceRequest />} />
      </Route>
    </Routes>
  );
}

// ----------- Admin App (existing) -----------
interface HealthStatus {
  status: string;
  database: string;
  timestamp: string;
}

function AdminApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dbStatus, setDbStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: HealthStatus) => {
        setDbStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching backend health:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-screen bg-slate-100">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-800 flex items-center space-x-2">
          <Layers className="h-8 w-8 text-green-400" />
          <span className="text-xl font-bold tracking-wider text-white">SprinkSoft</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-green-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
            <LayoutDashboard className="h-5 w-5" /><span>Dashboard</span>
          </button>
          <button onClick={() => setActiveTab('customers')} className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'customers' ? 'bg-green-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
            <Users className="h-5 w-5" /><span>Customers</span>
          </button>
          <button onClick={() => setActiveTab('jobs')} className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'jobs' ? 'bg-green-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
            <Calendar className="h-5 w-5" /><span>Job Scheduling</span>
          </button>
          <button onClick={() => setActiveTab('inventory')} className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'inventory' ? 'bg-green-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
            <Package className="h-5 w-5" /><span>Inventory & Parts</span>
          </button>
          <button onClick={() => setActiveTab('billing')} className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'billing' ? 'bg-green-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
            <FileText className="h-5 w-5" /><span>Billing & Invoices</span>
          </button>
          <a href="/portal" className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 mt-4 border-t border-slate-800 pt-4">
            <UserCircle className="h-5 w-5" /><span>Customer Portal</span>
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-950 text-xs text-slate-500 space-y-2">
          <div>Logged in as: <span className="text-slate-300 font-semibold">Lead Engineer</span></div>
          <div className="flex items-center space-x-2"><Database className="h-4 w-4" /><span>API & DB Status:</span></div>
          {loading ? <span className="text-yellow-500">Checking connection...</span> : dbStatus ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-1"><CheckCircle className="h-3 w-3 text-green-500" /><span className="text-green-400 font-medium">Server: {dbStatus.status}</span></div>
              <div className="flex items-center space-x-1"><CheckCircle className="h-3 w-3 text-green-500" /><span className="text-green-400 font-medium">DB: {dbStatus.database}</span></div>
            </div>
          ) : <div className="flex items-center space-x-1 text-red-400"><AlertCircle className="h-3 w-3" /><span>Offline / Unreachable</span></div>}
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <h1 className="text-xl font-semibold text-slate-800 capitalize">{activeTab === 'dashboard' ? 'System Overview' : `${activeTab} Management`}</h1>
          <div className="text-xs text-slate-500">Platform Version: 0.2.0</div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Welcome to SprinkSoft!</h2>
                <p className="text-slate-600 text-sm mb-4">The AI Irrigation System Designer is now live. Create irrigation designs, auto-generate BOMs, and produce professional quote PDFs.</p>
                <div className="flex space-x-4">
                  <div className="bg-slate-50 p-4 rounded-lg flex-1 border border-slate-150"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Frontend</div><div className="text-sm font-bold text-slate-700 mt-1">Vite + React + Tailwind</div><div className="text-xs text-green-600 mt-1 flex items-center"><span className="h-2 w-2 rounded-full bg-green-500 inline-block mr-1"></span> Active</div></div>
                  <div className="bg-slate-50 p-4 rounded-lg flex-1 border border-slate-150"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Backend</div><div className="text-sm font-bold text-slate-700 mt-1">Express.js + TypeScript</div><div className="text-xs text-green-600 mt-1 flex items-center"><span className="h-2 w-2 rounded-full bg-green-500 inline-block mr-1"></span> Active on Port 3000</div></div>
                  <div className="bg-slate-50 p-4 rounded-lg flex-1 border border-slate-150"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Database</div><div className="text-sm font-bold text-slate-700 mt-1">Prisma + SQLite</div><div className="text-xs text-green-600 mt-1 flex items-center"><span className="h-2 w-2 rounded-full bg-green-500 inline-block mr-1"></span> Connected</div></div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><div className="text-sm font-medium text-slate-400">Total Subscribers</div><div className="text-3xl font-extrabold text-slate-800 mt-2">124</div><div className="text-xs text-green-500 mt-1">MRR: $12,450</div></div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><div className="text-sm font-medium text-slate-400">Active Technicians</div><div className="text-3xl font-extrabold text-slate-800 mt-2">48</div><div className="text-xs text-slate-500 mt-1">Across 12 tenants</div></div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><div className="text-sm font-medium text-slate-400">Scheduled Jobs (Today)</div><div className="text-3xl font-extrabold text-slate-800 mt-2">18</div><div className="text-xs text-green-500 mt-1">100% route-optimized</div></div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><div className="text-sm font-medium text-slate-400">Sprinkler Quotes (Monthly)</div><div className="text-3xl font-extrabold text-slate-800 mt-2">86</div><div className="text-xs text-green-500 mt-1">54% conversion rate</div></div>
              </div>
            </div>
          )}
          {activeTab !== 'dashboard' && (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-800 capitalize">{activeTab} Management</h2>
              <p className="text-slate-600 text-sm">This section is under active development.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ----------- Root App with Router -----------
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Main dashboard with AppShell */}
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* AI Designer routes with AppShell */}
            <Route path="/designer" element={<DesignerListPage />} />
            <Route path="/designer/new" element={<DesignerNewPage />} />
            <Route path="/designer/:id" element={<DesignerEditorPage />} />

            {/* Customer Portal */}
            <Route
              path="/portal/*"
              element={
                <PortalProvider>
                  <PortalRoutes />
                </PortalProvider>
              }
            />

            {/* Legacy admin app — catch-all */}
            <Route path="/*" element={<AdminApp />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}