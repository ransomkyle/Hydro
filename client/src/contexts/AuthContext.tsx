import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, type AuthUser } from '@/lib/api'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { companyName: string; email: string; password: string; firstName: string; lastName: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.auth.me()
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.auth.login({ email, password })
    setUser(u)
  }, [])

  const register = useCallback(async (data: { companyName: string; email: string; password: string; firstName: string; lastName: string }) => {
    const u = await api.auth.register(data)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}