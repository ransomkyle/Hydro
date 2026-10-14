import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext';
import { LayoutDashboard, Calendar, FileText, Wrench, LogOut, Sprout, Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/portal', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portal/appointments', icon: Calendar, label: 'Appointments' },
  { to: '/portal/invoices', icon: FileText, label: 'Invoices' },
  { to: '/portal/service-request', icon: Wrench, label: 'Request Service' },
];

export default function PortalLayout() {
  const { session, logout } = usePortal();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const customerName = session?.customer
    ? `${session.customer.firstName} ${session.customer.lastName}`
    : 'Customer';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sprout className="h-6 w-6 text-green-600" />
          <span className="font-bold text-slate-800">SprinkSoft</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:min-h-screen bg-white border-r border-slate-200">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <Sprout className="h-6 w-6 text-green-600" />
            <span className="font-bold text-slate-800 text-lg">SprinkSoft</span>
          </div>

          <div className="px-3 py-4 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Welcome</p>
            <p className="text-sm font-semibold text-slate-700">{customerName}</p>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
