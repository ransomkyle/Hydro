import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface PortalCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface PortalSession {
  token: string;
  customer: PortalCustomer;
}

interface PortalContextType {
  session: PortalSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, portalCode: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  fetchApi: (path: string, options?: RequestInit) => Promise<Response>;
}

const PortalContext = createContext<PortalContextType | null>(null);

const TOKEN_KEY = 'sprinksoft_portal_token';
const CUSTOMER_KEY = 'sprinksoft_portal_customer';

export function PortalProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedCustomer = localStorage.getItem(CUSTOMER_KEY);
    if (storedToken && storedCustomer) {
      try {
        const customer = JSON.parse(storedCustomer);
        setSession({ token: storedToken, customer });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CUSTOMER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, portalCode: string) => {
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, portalCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed.' };
      }

      const newSession: PortalSession = { token: data.token, customer: data.customer };
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data.customer));
      setSession(newSession);

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    setSession(null);
  }, []);

  const fetchApi = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`/api/portal${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
    });

    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }

    return res;
  }, [session, logout]);

  return (
    <PortalContext.Provider value={{ session, isAuthenticated: !!session, isLoading, login, logout, fetchApi }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within PortalProvider');
  return ctx;
}
