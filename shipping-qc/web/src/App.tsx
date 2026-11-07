import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import AuditReports from './pages/AuditReports';
import Capa from './pages/Capa';
import Dashboard from './pages/Dashboard';
import Gauges from './pages/Gauges';
import Import from './pages/Import';
import Reports from './pages/Reports';
import ForcePassword from './pages/ForcePassword';
import Login from './pages/Login';
import { Account, Notifications } from './pages/Misc';
import NewShipment from './pages/NewShipment';
import ShipmentDetail from './pages/ShipmentDetail';
import Shipments from './pages/Shipments';
import { TemplateEdit, TemplateList } from './pages/Templates';
import Users from './pages/Users';

function Gate() {
  const { user, can } = useAuth();
  if (!user) return <Login />;
  if (user.mustChange) return <ForcePassword />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="shipments/new" element={can('shipping', 'inspector', 'manager', 'admin') ? <NewShipment /> : <Navigate to="/shipments" />} />
        <Route path="shipments/:id" element={<ShipmentDetail />} />
        <Route path="templates" element={<TemplateList />} />
        <Route path="templates/:id" element={<TemplateEdit />} />
        <Route path="audit" element={can('inspector', 'manager', 'admin', 'auditor') ? <AuditReports /> : <Navigate to="/" />} />
        <Route path="users" element={can('admin') ? <Users /> : <Navigate to="/" />} />
        <Route path="capa" element={<Capa />} />
        <Route path="gauges" element={<Gauges />} />
        <Route path="reports" element={can('inspector', 'manager', 'admin', 'auditor') ? <Reports /> : <Navigate to="/" />} />
        <Route path="import" element={can('shipping', 'inspector', 'manager', 'admin') ? <Import /> : <Navigate to="/shipments" />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><ToastProvider><AuthProvider><Gate /></AuthProvider></ToastProvider></BrowserRouter>;
}
