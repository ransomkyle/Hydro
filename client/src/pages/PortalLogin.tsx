import { useState, FormEvent } from 'react';
import { usePortal } from '../context/PortalContext';
import { Sprout, LogIn, AlertCircle } from 'lucide-react';

export default function PortalLogin() {
  const { login } = usePortal();
  const [email, setEmail] = useState('');
  const [portalCode, setPortalCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !portalCode.trim()) {
      setError('Please enter both email and portal code.');
      return;
    }

    setSubmitting(true);
    const result = await login(email.trim(), portalCode.trim().toUpperCase());
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Invalid credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-600 mb-4 shadow-lg">
            <Sprout className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">SprinkSoft Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to manage your irrigation services</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-100">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Portal Code</label>
              <input
                type="text"
                value={portalCode}
                onChange={(e) => setPortalCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3D4"
                maxLength={8}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm font-mono tracking-widest focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
              />
              <p className="text-xs text-slate-400 mt-1">
                Your unique 8-character code from your service provider
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              <LogIn className="h-4 w-4" />
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Protected portal for irrigation customers &middot; Powered by SprinkSoft
        </p>
      </div>
    </div>
  );
}
